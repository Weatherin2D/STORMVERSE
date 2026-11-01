import type { RadarObservation, SatelliteObservation } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { CloudBand, CloudFieldPoint, CloudTypeProxy } from './cloudCoverGrid'

/** One RainViewer XYZ tile turned into a shaped cloud slab + dense fill points. */
export interface ImageryCloudTile {
  z: number
  x: number
  y: number
  west: number
  south: number
  east: number
  north: number
  /** Soft white cloud alpha image matching the mosaic footprint. */
  cloudImage: HTMLCanvasElement
  meanIntensity: number
  maxIntensity: number
  coverage: number
  baseHeightM: number
  topHeightM: number
  provenance: Provenance
}

export interface ImageryCloudField {
  tiles: ImageryCloudTile[]
  /** Dense points only where imagery has signal — fills the footprint continuously. */
  fillPoints: CloudFieldPoint[]
  source: 'infrared' | 'radar'
  observedAt: string
}

function tileToLonLatBounds(z: number, x: number, y: number) {
  const n = 2 ** z
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  return { west, south, east, north }
}

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) }
}

/**
 * Global WebMercator tile indices spanning nearly the whole Earth.
 * Skips extreme polar rows where mercator stretching is useless for cloud sheets.
 */
function tilesForGlobe(z: number): Array<{ x: number; y: number }> {
  const n = 2 ** z
  const yMin = lonLatToTile(0, 72, z).y
  const yMax = lonLatToTile(0, -72, z).y
  const out: Array<{ x: number; y: number }> = []
  for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
    for (let x = 0; x < n; x++) {
      out.push({ x, y })
    }
  }
  return out
}

async function fetchTileBitmap(
  template: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<ImageBitmap | null> {
  const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  try {
    const res = await fetch(url, { signal, mode: 'cors' })
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

/**
 * Convert mosaic colours into a soft white cloud alpha map that keeps the exact footprint.
 * Transparent pixels stay empty — so the sheet silhouette matches the imagery.
 */
function mosaicToCloudAlpha(
  bmp: ImageBitmap,
  mode: 'infrared' | 'radar',
  fillStep: number,
): {
  canvas: HTMLCanvasElement
  mean: number
  max: number
  coverage: number
  fill: Array<{ u: number; v: number; intens: number }>
} {
  const w = bmp.width
  const h = bmp.height
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(bmp, 0, 0)
  const data = sctx.getImageData(0, 0, w, h)

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)

  let sum = 0
  let max = 0
  let hit = 0
  const fill: Array<{ u: number; v: number; intens: number }> = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data.data[i]
      const g = data.data[i + 1]
      const b = data.data[i + 2]
      const a = data.data[i + 3]
      let intens = 0
      if (a > 12) {
        if (mode === 'infrared') {
          intens = Math.max(r, g, b) / 255
        } else {
          intens = Math.min(1, (Math.max(r, g, b) / 255) * (a / 255) * 1.2)
        }
      }
      if (intens > 0.1) {
        hit++
        sum += intens
        max = Math.max(max, intens)
        const alpha = Math.min(255, Math.floor(40 + intens * 200))
        const shade = Math.floor(210 + intens * 45)
        img.data[i] = shade
        img.data[i + 1] = shade + 2
        img.data[i + 2] = Math.min(255, shade + 8)
        img.data[i + 3] = alpha
        if (x % fillStep === 0 && y % fillStep === 0) {
          fill.push({ u: x, v: y, intens })
        }
      }
    }
  }
  octx.putImageData(img, 0, 0)
  octx.filter = 'blur(1.2px)'
  octx.drawImage(out, 0, 0)
  octx.filter = 'none'

  return {
    canvas: out,
    mean: hit ? sum / hit : 0,
    max,
    coverage: hit / (w * h),
    fill,
  }
}

function bandFromIntens(intens: number): {
  band: CloudBand
  typeProxy: CloudTypeProxy
  heightM: number
  thicknessM: number
} {
  if (intens > 0.7) {
    return {
      band: 'high',
      typeProxy: 'cirrus_proxy',
      heightM: 10_000 + intens * 3_500,
      thicknessM: 4_000 + intens * 5_000,
    }
  }
  if (intens > 0.4) {
    return {
      band: 'mid',
      typeProxy: 'cumulus_proxy',
      heightM: 5_000 + intens * 4_000,
      thicknessM: 5_000 + intens * 7_000,
    }
  }
  return {
    band: 'low',
    typeProxy: 'stratus_proxy',
    heightM: 1_800 + intens * 2_500,
    thicknessM: 2_500 + intens * 3_500,
  }
}

/** Keep fill geographically spread instead of only the strongest storms. */
function diversifyFillPoints(points: CloudFieldPoint[], maxPoints: number): CloudFieldPoint[] {
  if (points.length <= maxPoints) return points
  // Bucket by ~5° cells so every region can contribute.
  const buckets = new Map<string, CloudFieldPoint[]>()
  for (const p of points) {
    const key = `${Math.round(p.longitude / 5) * 5},${Math.round(p.latitude / 5) * 5}`
    const list = buckets.get(key)
    if (list) list.push(p)
    else buckets.set(key, [p])
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => b.volumeStrength - a.volumeStrength)
  }
  const out: CloudFieldPoint[] = []
  let round = 0
  while (out.length < maxPoints) {
    let added = 0
    for (const list of buckets.values()) {
      if (round < list.length) {
        out.push(list[round])
        added++
        if (out.length >= maxPoints) break
      }
    }
    if (added === 0) break
    round++
  }
  return out
}

/**
 * Build shaped cloud tiles + dense fill from IR (preferred) or radar mosaics
 * across the whole globe — not a regional subset.
 */
export async function buildImageryCloudField(
  opts: {
    satellite: SatelliteObservation | null
    radar: RadarObservation | null
    signal?: AbortSignal
  },
): Promise<ImageryCloudField | null> {
  const sat = opts.satellite?.available ? opts.satellite : null
  const radar = opts.radar?.available ? opts.radar : null
  const mode: 'infrared' | 'radar' = sat?.tileUrlTemplate ? 'infrared' : 'radar'
  const frame = mode === 'infrared' ? sat : radar
  const template = frame?.tileUrlTemplate
  if (!frame || !template) return null

  // z=3 ≈ 64 tiles worldwide (fast, Earth-wide). IR can afford z=4 for sharper sheets.
  const z = mode === 'infrared' ? 4 : 3
  const tileIds = tilesForGlobe(z)
  const fillStep = mode === 'radar' ? 3 : 4
  const provenance: Provenance = {
    kind: mode === 'infrared' ? 'direct' : 'processed',
    summary:
      mode === 'infrared'
        ? 'Global cloud sheets shaped from RainViewer infrared mosaic footprint.'
        : 'Global cloud sheets shaped from RainViewer radar mosaic footprint (IR unpublished).',
    sourceId: mode === 'infrared' ? 'rainviewer-ir-shaped-global' : 'rainviewer-radar-shaped-global',
    observedAt: frame.observedAt,
    qualityNote:
      'Silhouette follows mosaic alpha worldwide; height/thickness are brightness heuristics — not retrieved CTH.',
  }

  const tiles: ImageryCloudTile[] = []
  const fillPoints: CloudFieldPoint[] = []

  const queue = [...tileIds]
  const workers = Array.from({ length: 10 }, async () => {
    while (queue.length) {
      if (opts.signal?.aborted) return
      const id = queue.shift()
      if (!id) return
      const bmp = await fetchTileBitmap(template, z, id.x, id.y, opts.signal)
      if (!bmp) continue
      const mapped = mosaicToCloudAlpha(bmp, mode, fillStep)
      bmp.close()
      if (mapped.coverage < 0.004 || mapped.max < 0.12) continue

      const bounds = tileToLonLatBounds(z, id.x, id.y)
      const meta = bandFromIntens(mapped.mean || mapped.max)
      const baseHeightM = Math.max(600, meta.heightM - meta.thicknessM * 0.4)
      const topHeightM = baseHeightM + meta.thicknessM

      tiles.push({
        z,
        x: id.x,
        y: id.y,
        ...bounds,
        cloudImage: mapped.canvas,
        meanIntensity: mapped.mean,
        maxIntensity: mapped.max,
        coverage: mapped.coverage,
        baseHeightM,
        topHeightM,
        provenance,
      })

      const lonSpan = bounds.east - bounds.west
      const latSpan = bounds.north - bounds.south
      // Per-tile fill quota keeps every region represented on the globe.
      const perTileCap = mode === 'infrared' ? 80 : 60
      const ranked = mapped.fill
        .filter((f) => f.intens >= 0.12)
        .sort((a, b) => b.intens - a.intens)
        .slice(0, perTileCap)
      for (const f of ranked) {
        const lon = bounds.west + ((f.u + 0.5) / mapped.canvas.width) * lonSpan
        const lat = bounds.north - ((f.v + 0.5) / mapped.canvas.height) * latSpan
        const bm = bandFromIntens(f.intens)
        const metrePerPix =
          (lonSpan * 111_320 * Math.max(0.15, Math.cos((lat * Math.PI) / 180))) /
          mapped.canvas.width
        fillPoints.push({
          longitude: lon,
          latitude: lat,
          band: bm.band,
          cover: Math.min(1, f.intens),
          heightM: bm.heightM,
          thicknessM: bm.thicknessM,
          // Larger scale at coarse zoom so neighbours still merge into sheets
          horizontalScaleM: Math.max(4_000, metrePerPix * fillStep * 1.6),
          volumeStrength: f.intens,
          typeProxy: bm.typeProxy,
          provenance,
        })
      }
    }
  })
  await Promise.all(workers)

  if (tiles.length === 0 && fillPoints.length === 0) return null
  return {
    tiles,
    fillPoints: diversifyFillPoints(fillPoints, 12_000),
    source: mode,
    observedAt: frame.observedAt,
  }
}
