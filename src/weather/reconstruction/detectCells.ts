import { australiaTileRange, tilePixelToLonLat } from './mercator'
import type { RadarObservation } from '../types/observations'

export interface RadarCellCandidate {
  id: string
  longitude: number
  latitude: number
  /** 0–1 relative intensity from mosaic colour brightness (not calibrated dBZ). */
  intensity: number
  sampleCount: number
  observedAt: string
  frameTimeUnix: number
  framePath?: string
}

interface PixelHit {
  lon: number
  lat: number
  intensity: number
}

/**
 * Derive coarse storm-cell candidates from a RainViewer mosaic frame.
 *
 * Method: sample Australia tiles at low zoom, threshold coloured precip pixels,
 * grid-bin, and keep local maxima. This is a **derived estimate** from processed
 * imagery — not an official cell product and not calibrated reflectivity.
 */
export async function detectCellsFromRadarFrame(
  frame: RadarObservation,
  options: { zoom?: number; signal?: AbortSignal } = {},
): Promise<RadarCellCandidate[]> {
  if (!frame.tileUrlTemplate || !frame.available || frame.frameTimeUnix == null) {
    return []
  }

  const zoom = options.zoom ?? 3
  const range = australiaTileRange(zoom)
  const hits: PixelHit[] = []

  // Limit concurrency so browsers (and software WebGL hosts) stay responsive.
  const coords: Array<{ x: number; y: number }> = []
  for (let x = range.x0; x <= range.x1; x++) {
    for (let y = range.y0; y <= range.y1; y++) {
      coords.push({ x, y })
    }
  }
  const concurrency = 4
  for (let i = 0; i < coords.length; i += concurrency) {
    if (options.signal?.aborted) return []
    const batch = coords.slice(i, i + concurrency)
    await Promise.all(
      batch.map(({ x, y }) =>
        sampleTile(frame.tileUrlTemplate!, zoom, x, y, hits, options.signal).catch(() => {
          // Skip failed tiles; mosaic remains partial.
        }),
      ),
    )
  }

  if (hits.length === 0) return []

  // Bin into ~1.5° cells so sparse mosaic samples coalesce
  const binDeg = 1.5
  const bins = new Map<string, { lon: number; lat: number; intensity: number; n: number }>()
  for (const hit of hits) {
    const bx = Math.floor(hit.lon / binDeg)
    const by = Math.floor(hit.lat / binDeg)
    const key = `${bx}:${by}`
    const cur = bins.get(key)
    if (!cur) {
      bins.set(key, { lon: hit.lon, lat: hit.lat, intensity: hit.intensity, n: 1 })
    } else {
      cur.lon += hit.lon
      cur.lat += hit.lat
      cur.intensity = Math.max(cur.intensity, hit.intensity)
      cur.n += 1
    }
  }
  const candidates: RadarCellCandidate[] = []
  for (const [key, bin] of bins) {
    const lon = bin.lon / bin.n
    const lat = bin.lat / bin.n
    // Prefer stronger / larger bins — allow single-sample foci from sparse mosaics
    const score = bin.intensity * 0.7 + Math.min(1, bin.n / 12) * 0.3
    if (score < 0.12) continue
    candidates.push({
      id: `cell-${frame.frameTimeUnix}-${key}`,
      longitude: lon,
      latitude: lat,
      intensity: clamp01(score),
      sampleCount: bin.n,
      observedAt: frame.observedAt,
      frameTimeUnix: frame.frameTimeUnix,
      framePath: frame.framePath,
    })
  }

  candidates.sort((a, b) => b.intensity - a.intensity)
  return candidates.slice(0, 16)
}

async function sampleTile(
  template: string,
  z: number,
  x: number,
  y: number,
  hits: PixelHit[],
  signal?: AbortSignal,
): Promise<void> {
  const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  const res = await fetch(url, { signal, mode: 'cors' })
  if (!res.ok) return
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  // Downsample for speed
  const size = 64
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return
  }
  ctx.drawImage(bitmap, 0, 0, size, size)
  bitmap.close()
  const data = ctx.getImageData(0, 0, size, size).data

  // Stride sampling
  for (let py = 0; py < size; py += 2) {
    for (let px = 0; px < size; px += 2) {
      const i = (py * size + px) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 20) continue
      // Near-black rejection — RainViewer precip is colourful / bright
      const maxc = Math.max(r, g, b)
      const minc = Math.min(r, g, b)
      if (maxc < 28) continue
      const sat = maxc === 0 ? 0 : (maxc - minc) / maxc
      if (sat < 0.08 && maxc < 100) continue
      const intensity = clamp01((maxc / 255) * 0.5 + sat * 0.5)
      if (intensity < 0.12) continue
      const { lon, lat } = tilePixelToLonLat(z, x, y, (px + 0.5) * (256 / size), (py + 0.5) * (256 / size))
      // Keep Australia box
      if (lon < 112 || lon > 154 || lat > -10 || lat < -45) continue
      hits.push({ lon, lat, intensity })
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
