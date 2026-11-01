import type { RadarObservation } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { CloudFieldPoint } from './cloudCoverGrid'

/**
 * When infrared frames are absent, sample RainViewer radar mosaics into
 * volumetric cloud proxies (precip-bearing / convective masses).
 * Labelled as radar-derived — not satellite CTH.
 */

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) }
}

function tilePixel(lon: number, lat: number, z: number, tileSize: number) {
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

type TileCache = Map<string, ImageData | null>

async function loadTile(
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

function sampleAlphaBright(data: ImageData, u: number, v: number): number {
  const i = (v * data.width + u) * 4
  const a = data.data[i + 3] ?? 0
  if (a < 10) return 0
  const r = data.data[i] ?? 0
  const g = data.data[i + 1] ?? 0
  const b = data.data[i + 2] ?? 0
  // Radar colour schemes: brighter / warmer colours ≈ stronger returns
  return Math.min(1, (Math.max(r, g, b) / 255) * (a / 255) * 1.15)
}

/** Dense sample grid over RainViewer radar coverage (Australia-first + wider rim). */
function radarGrid(): Array<{ lon: number; lat: number }> {
  const pts: Array<{ lon: number; lat: number }> = []
  for (let lat = -45; lat <= -8; lat += 0.85) {
    for (let lon = 110; lon <= 156; lon += 0.85) {
      pts.push({ lon, lat })
    }
  }
  // NZ / Coral Sea rim
  for (let lat = -48; lat <= -12; lat += 1.5) {
    for (let lon = 156; lon <= 180; lon += 1.5) {
      pts.push({ lon, lat })
    }
  }
  return pts
}

export async function sampleRadarCloudProxies(
  frame: RadarObservation | null,
  opts: { zoom?: number; maxPoints?: number; signal?: AbortSignal } = {},
): Promise<CloudFieldPoint[]> {
  const template = frame?.tileUrlTemplate
  if (!frame?.available || !template) return []

  const zoom = opts.zoom ?? 5
  const maxPoints = opts.maxPoints ?? 700
  const cache: TileCache = new Map()
  const grid = radarGrid()
  const provenance: Provenance = {
    kind: 'processed',
    summary:
      'Volumetric cloud proxies sampled from RainViewer radar mosaic (IR unavailable) — reflectivity→depth heuristics, not satellite CTH.',
    sourceId: 'rainviewer-radar-cloud-proxy',
    observedAt: frame.observedAt,
    qualityNote: 'Used when infrared satellite frames are not published in the catalog.',
  }

  const tiles = new Set<string>()
  for (const p of grid) {
    const t = lonLatToTile(p.lon, p.lat, zoom)
    tiles.add(`${t.x},${t.y}`)
  }
  await Promise.all(
    [...tiles].map(async (key) => {
      const [xs, ys] = key.split(',').map(Number)
      await loadTile(template, zoom, xs, ys, cache, opts.signal)
    }),
  )

  const scored: Array<CloudFieldPoint & { score: number }> = []
  for (const p of grid) {
    const pix = tilePixel(p.lon, p.lat, zoom, 256)
    const data = cache.get(`${zoom}/${pix.x}/${pix.y}`)
    if (!data) continue
    let sum = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = sampleAlphaBright(
          data,
          Math.min(255, Math.max(0, pix.u + dx * 2)),
          Math.min(255, Math.max(0, pix.v + dy * 2)),
        )
        if (b > 0) {
          sum += b
          n++
        }
      }
    }
    const intens = n ? sum / n : 0
    if (intens < 0.12) continue
    const convective = intens > 0.55
    scored.push({
      longitude: p.lon,
      latitude: p.lat,
      band: convective ? 'mid' : 'low',
      cover: Math.min(1, 0.25 + intens),
      heightM: convective ? 6_500 + intens * 5_500 : 2_200 + intens * 2_800,
      thicknessM: convective ? 6_000 + intens * 8_000 : 3_000 + intens * 4_500,
      horizontalScaleM: convective ? 18_000 + intens * 28_000 : 28_000 + intens * 40_000,
      volumeStrength: intens,
      typeProxy: convective ? 'cumulus_proxy' : 'stratus_proxy',
      provenance,
      score: intens,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxPoints).map(({ score: _s, ...rest }) => rest)
}
