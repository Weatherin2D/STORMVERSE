import { OPEN_METEO } from '../../config/weather'
import type { EnvironmentalSample } from '../types/observations'

interface OpenMeteoResponse {
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
  hourly?: {
    time: string[]
    cape?: Array<number | null>
    convective_inhibition?: Array<number | null>
    precipitation?: Array<number | null>
  }
}

export interface EnvironmentalProfile extends EnvironmentalSample {
  capeJkg?: number
  cinJkg?: number
  hourlyCape?: Array<{ time: string; cape: number | null; cin: number | null }>
}

/**
 * Open-Meteo forecast / model context for a point location.
 * Labelled as model output — not a radar or in-situ observation.
 */
export async function fetchOpenMeteoEnvironment(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EnvironmentalProfile> {
  const url = new URL(OPEN_METEO.forecastUrl)
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
  )
  url.searchParams.set('hourly', 'cape,convective_inhibition,precipitation')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'UTC')

  try {
    const res = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Open-Meteo failed (${res.status})`)
    const data = (await res.json()) as OpenMeteoResponse
    const cur = data.current
    if (!cur) throw new Error('Open-Meteo response missing current block')

    let capeJkg: number | undefined
    let cinJkg: number | undefined
    const hourlyCape: EnvironmentalProfile['hourlyCape'] = []
    if (data.hourly?.time) {
      for (let i = 0; i < data.hourly.time.length; i++) {
        const cape = data.hourly.cape?.[i] ?? null
        const cin = data.hourly.convective_inhibition?.[i] ?? null
        hourlyCape.push({ time: data.hourly.time[i], cape, cin })
      }
      // Pick hour nearest to current time
      const now = Date.parse(cur.time)
      let best = 0
      let bestDiff = Infinity
      hourlyCape.forEach((h, i) => {
        const diff = Math.abs(Date.parse(h.time) - now)
        if (diff < bestDiff) {
          bestDiff = diff
          best = i
        }
      })
      const nearest = hourlyCape[best]
      if (nearest?.cape != null) capeJkg = nearest.cape
      if (nearest?.cin != null) cinJkg = nearest.cin
    }

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
      capeJkg,
      cinJkg,
      hourlyCape,
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
