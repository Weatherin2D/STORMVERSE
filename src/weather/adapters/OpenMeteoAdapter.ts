import { OPEN_METEO } from '../../config/weather'
import type { EnvironmentalSample } from '../types/observations'

interface OpenMeteoCurrentResponse {
  latitude: number
  longitude: number
  current?: {
    time: string
    temperature_2m?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    precipitation?: number
    weather_code?: number
  }
}

/**
 * Open-Meteo forecast context for a point location.
 * Labelled as model output — not a radar/satellite observation.
 */
export async function fetchOpenMeteoEnvironment(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EnvironmentalSample> {
  const url = new URL(OPEN_METEO.forecastUrl)
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
  )
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'UTC')

  try {
    const res = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Open-Meteo failed (${res.status})`)
    const data = (await res.json()) as OpenMeteoCurrentResponse
    const cur = data.current
    if (!cur) throw new Error('Open-Meteo response missing current block')

    return {
      id: `open-meteo-${longitude.toFixed(2)}-${latitude.toFixed(2)}`,
      sourceId: 'open-meteo',
      validAt: new Date(cur.time).toISOString(),
      longitude,
      latitude,
      temperatureC: cur.temperature_2m,
      relativeHumidityPct: cur.relative_humidity_2m,
      windSpeedMps: cur.wind_speed_10m,
      precipitationMm: cur.precipitation,
      weatherCode: cur.weather_code,
      available: true,
      provenance: {
        kind: 'model',
        summary: OPEN_METEO.attribution,
        sourceId: 'open-meteo',
        observedAt: new Date(cur.time).toISOString(),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Open-Meteo unavailable'
    return {
      id: `open-meteo-unavailable`,
      sourceId: 'open-meteo',
      validAt: new Date(0).toISOString(),
      longitude,
      latitude,
      available: false,
      provenance: {
        kind: 'model',
        summary: message,
        sourceId: 'open-meteo',
      },
    }
  }
}
