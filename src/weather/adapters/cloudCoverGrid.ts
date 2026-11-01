import { OPEN_METEO } from '../../config/weather'
import type { Provenance } from '../types/provenance'

export type CloudBand = 'low' | 'mid' | 'high'

/** Model cloud-cover type proxy — not a WMO cloud-type identification. */
export type CloudTypeProxy = 'stratus_proxy' | 'cumulus_proxy' | 'cirrus_proxy'

export interface CloudCoverSample {
  longitude: number
  latitude: number
  lowPct: number
  midPct: number
  highPct: number
  validAt: string
}

export interface CloudFieldPoint {
  longitude: number
  latitude: number
  band: CloudBand
  /** 0–1 cover fraction for this band. */
  cover: number
  /** Approximate height of shell centre (metres). */
  heightM: number
  /** Vertical thickness heuristic (metres). */
  thicknessM: number
  typeProxy: CloudTypeProxy
  provenance: Provenance
}

const BAND_META: Record<
  CloudBand,
  { heightM: number; thicknessM: number; typeProxy: CloudTypeProxy }
> = {
  low: { heightM: 1800, thicknessM: 1400, typeProxy: 'stratus_proxy' },
  mid: { heightM: 5500, thicknessM: 2200, typeProxy: 'cumulus_proxy' },
  high: { heightM: 11000, thicknessM: 1800, typeProxy: 'cirrus_proxy' },
}

function buildGrid(
  west: number,
  east: number,
  south: number,
  north: number,
  step: number,
): Array<{ lon: number; lat: number }> {
  const pts: Array<{ lon: number; lat: number }> = []
  for (let lat = south; lat <= north + 1e-6; lat += step) {
    for (let lon = west; lon <= east + 1e-6; lon += step) {
      pts.push({ lon: Math.round(lon * 100) / 100, lat: Math.round(lat * 100) / 100 })
    }
  }
  return pts
}

/** Sparse global + denser Australia grid for Open-Meteo cloud-cover sampling. */
export function cloudCoverSampleLocations(): Array<{ lon: number; lat: number }> {
  const global = buildGrid(-165, 165, -55, 55, 30)
  const aus = buildGrid(112, 154, -44, -11, 4)
  const key = new Set<string>()
  const out: Array<{ lon: number; lat: number }> = []
  for (const p of [...aus, ...global]) {
    const k = `${p.lon},${p.lat}`
    if (key.has(k)) continue
    key.add(k)
    out.push(p)
  }
  return out
}

async function fetchPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<CloudCoverSample | null> {
  const url = new URL(OPEN_METEO.forecastUrl)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', 'cloud_cover_low,cloud_cover_mid,cloud_cover_high')
  url.searchParams.set('timezone', 'UTC')
  try {
    const res = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      current?: {
        time?: string
        cloud_cover_low?: number
        cloud_cover_mid?: number
        cloud_cover_high?: number
      }
    }
    const cur = data.current
    if (!cur?.time) return null
    return {
      longitude: lon,
      latitude: lat,
      lowPct: Number(cur.cloud_cover_low ?? 0),
      midPct: Number(cur.cloud_cover_mid ?? 0),
      highPct: Number(cur.cloud_cover_high ?? 0),
      validAt: new Date(cur.time).toISOString(),
    }
  } catch {
    return null
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Fetch model cloud-cover samples. Labelled as Open-Meteo model output — not satellite CTH.
 */
export async function fetchCloudCoverGrid(signal?: AbortSignal): Promise<CloudCoverSample[]> {
  const locs = cloudCoverSampleLocations()
  const results = await mapPool(locs, 6, (p) => fetchPoint(p.lat, p.lon, signal))
  return results.filter((r): r is CloudCoverSample => r != null)
}

export function samplesToCloudFieldPoints(samples: CloudCoverSample[]): CloudFieldPoint[] {
  const points: CloudFieldPoint[] = []
  const provenanceBase: Provenance = {
    kind: 'model',
    summary:
      'Open-Meteo model cloud_cover_low/mid/high — type proxies only, not WMO cloud-type ID or retrieved CTH.',
    sourceId: 'open-meteo-cloud-cover',
    observedAt: samples[0]?.validAt ?? new Date(0).toISOString(),
  }
  for (const s of samples) {
    const bands: Array<{ band: CloudBand; pct: number }> = [
      { band: 'low', pct: s.lowPct },
      { band: 'mid', pct: s.midPct },
      { band: 'high', pct: s.highPct },
    ]
    for (const { band, pct } of bands) {
      const cover = Math.max(0, Math.min(1, pct / 100))
      if (cover < 0.12) continue
      const meta = BAND_META[band]
      points.push({
        longitude: s.longitude,
        latitude: s.latitude,
        band,
        cover,
        heightM: meta.heightM,
        thicknessM: meta.thicknessM * (0.55 + cover * 0.7),
        typeProxy: meta.typeProxy,
        provenance: {
          ...provenanceBase,
          observedAt: s.validAt,
          qualityNote: `${band} cover ${Math.round(cover * 100)}% → ${meta.typeProxy}`,
        },
      })
    }
  }
  return points
}
