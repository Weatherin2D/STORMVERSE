import type { SatelliteObservation } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { CloudBand, CloudFieldPoint, CloudTypeProxy } from './cloudCoverGrid'

/**
 * Sample RainViewer infrared tiles into volumetric cloud field points.
 * IR brightness → opacity / top height heuristics — not retrieved CTH or optical depth.
 */

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return {
    x: ((x % n) + n) % n,
    y: Math.max(0, Math.min(n - 1, y)),
  }
}

function tilePixel(
  lon: number,
  lat: number,
  z: number,
  tileSize: number,
): { x: number; y: number; u: number; v: number } {
  const n = 2 ** z
  const xf = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.floor(xf)
  const y = Math.floor(yf)
  return {
    x: ((x % n) + n) % n,
    y: Math.max(0, Math.min(n - 1, y)),
    u: Math.min(tileSize - 1, Math.floor((xf - x) * tileSize)),
    v: Math.min(tileSize - 1, Math.floor((yf - y) * tileSize)),
  }
}

function buildSampleGrid(): Array<{ lon: number; lat: number; priority: number }> {
  const pts: Array<{ lon: number; lat: number; priority: number }> = []
  // Dense Australia / SW Pacific
  for (let lat = -44; lat <= -10; lat += 1.25) {
    for (let lon = 112; lon <= 168; lon += 1.25) {
      pts.push({ lon, lat, priority: 2 })
    }
  }
  // Global oceans / continents (coarser)
  for (let lat = -55; lat <= 60; lat += 4) {
    for (let lon = -170; lon <= 170; lon += 4) {
      if (lon >= 110 && lon <= 170 && lat >= -45 && lat <= -8) continue
      pts.push({ lon, lat, priority: 1 })
    }
  }
  return pts
}

type TileCache = Map<string, ImageData | null>

async function loadTileImageData(
  template: string,
  z: number,
  x: number,
  y: number,
  cache: TileCache,
  signal?: AbortSignal,
): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`
  if (cache.has(key)) return cache.get(key) ?? null
  const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  try {
    const res = await fetch(url, { signal, mode: 'cors' })
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const blob = await res.blob()
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      cache.set(key, null)
      return null
    }
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    cache.set(key, data)
    return data
  } catch {
    cache.set(key, null)
    return null
  }
}

function sampleBrightness(data: ImageData, u: number, v: number): number {
  const i = (v * data.width + u) * 4
  const r = data.data[i] ?? 0
  const g = data.data[i + 1] ?? 0
  const b = data.data[i + 2] ?? 0
  const a = data.data[i + 3] ?? 0
  if (a < 8) return 0
  // RainViewer IR colour scheme 2: brighter / colder tops → treat as stronger cloud.
  return Math.max(r, g, b) / 255
}

function bandFromBrightness(b: number): {
  band: CloudBand
  heightM: number
  thicknessM: number
  typeProxy: CloudTypeProxy
  horizontalScaleM: number
} {
  if (b > 0.72) {
    return {
      band: 'high',
      heightM: 9_500 + b * 4_500,
      thicknessM: 3_500 + b * 5_500,
      typeProxy: 'cirrus_proxy',
      horizontalScaleM: 28_000 + b * 36_000,
    }
  }
  if (b > 0.42) {
    return {
      band: 'mid',
      heightM: 4_200 + b * 3_800,
      thicknessM: 4_000 + b * 7_000,
      typeProxy: 'cumulus_proxy',
      horizontalScaleM: 22_000 + b * 40_000,
    }
  }
  return {
    band: 'low',
    heightM: 1_200 + b * 2_200,
    thicknessM: 2_200 + b * 3_500,
    typeProxy: 'stratus_proxy',
    horizontalScaleM: 30_000 + b * 50_000,
  }
}

export interface IrCloudSampleOptions {
  zoom?: number
  signal?: AbortSignal
  /** Max cloud points to emit (strongest first). */
  maxPoints?: number
}

/**
 * Build volumetric cloud points by sampling the current RainViewer IR mosaic.
 */
export async function sampleSatelliteIrCloudField(
  frame: SatelliteObservation | null,
  opts: IrCloudSampleOptions = {},
): Promise<CloudFieldPoint[]> {
  const template = frame?.tileUrlTemplate
  if (!frame?.available || !template) return []

  const zoom = opts.zoom ?? 4
  const maxPoints = opts.maxPoints ?? 900
  const cache: TileCache = new Map()
  const grid = buildSampleGrid()
  const provenance: Provenance = {
    kind: 'direct',
    summary:
      'Volumetric cloud field sampled from RainViewer infrared mosaic — brightness→height/thickness heuristics, not retrieved CTH/COT.',
    sourceId: 'rainviewer-ir-sample',
    observedAt: frame.observedAt,
    qualityNote: 'Processed IR imagery; cloud type proxies are brightness-band heuristics only.',
  }

  const scored: Array<CloudFieldPoint & { score: number }> = []

  // Prefetch unique tiles for denser region at z=zoom
  const tileKeys = new Set<string>()
  for (const p of grid) {
    const t = lonLatToTile(p.lon, p.lat, zoom)
    tileKeys.add(`${t.x},${t.y}`)
  }
  await Promise.all(
    [...tileKeys].map(async (key) => {
      const [xs, ys] = key.split(',').map(Number)
      await loadTileImageData(template, zoom, xs, ys, cache, opts.signal)
    }),
  )

  for (const p of grid) {
    const pix = tilePixel(p.lon, p.lat, zoom, 256)
    const data = cache.get(`${zoom}/${pix.x}/${pix.y}`)
    if (!data) continue
    // 3×3 neighbourhood average for smoother masses
    let sum = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const uu = Math.min(255, Math.max(0, pix.u + dx * 2))
        const vv = Math.min(255, Math.max(0, pix.v + dy * 2))
        const b = sampleBrightness(data, uu, vv)
        if (b > 0) {
          sum += b
          n++
        }
      }
    }
    const bright = n > 0 ? sum / n : 0
    if (bright < 0.14) continue
    const meta = bandFromBrightness(bright)
    const cover = Math.min(1, 0.2 + bright * 0.95)
    scored.push({
      longitude: p.lon,
      latitude: p.lat,
      band: meta.band,
      cover,
      heightM: meta.heightM,
      thicknessM: meta.thicknessM,
      typeProxy: meta.typeProxy,
      horizontalScaleM: meta.horizontalScaleM * (0.7 + p.priority * 0.15),
      volumeStrength: bright,
      provenance,
      score: bright * p.priority,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxPoints).map(({ score: _s, ...rest }) => rest)
}
