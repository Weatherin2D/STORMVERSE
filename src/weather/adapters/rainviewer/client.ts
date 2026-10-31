import type { RainViewerMapsResponse } from './types'

const DEFAULT_URL = 'https://api.rainviewer.com/public/weather-maps.json'

/**
 * Fetch RainViewer public weather-maps catalog.
 * Legitimate public API — see https://www.rainviewer.com/api.html
 */
export async function fetchRainViewerMaps(
  url: string = DEFAULT_URL,
  signal?: AbortSignal,
): Promise<RainViewerMapsResponse> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`RainViewer catalog request failed (${res.status})`)
  }
  return (await res.json()) as RainViewerMapsResponse
}

/** Build a Cesium/Leaflet-compatible XYZ template for a RainViewer frame. */
export function rainViewerTileTemplate(host: string, path: string): string {
  const base = host.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  // 256px tiles, colour scheme 2, smooth on, snow on — per RainViewer API docs
  return `${base}${p}/256/{z}/{x}/{y}/2/1_1.png`
}

export function unixToIso(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString()
}
