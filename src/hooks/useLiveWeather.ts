import { useEffect, useState } from 'react'
import { PROTOTYPE_STORM } from '../config/app'
import { RAINVIEWER } from '../config/weather'
import {
  australianWeatherProvider,
  fetchOpenMeteoEnvironment,
  type EnvironmentalSample,
  type RadarObservation,
  type SatelliteObservation,
  type WeatherObservationMeta,
} from '../weather'

export interface LiveWeatherState {
  loading: boolean
  error: string | null
  availability: WeatherObservationMeta[]
  radarFrames: RadarObservation[]
  satelliteFrames: SatelliteObservation[]
  environment: EnvironmentalSample | null
  refresh: () => void
}

export function useLiveWeather(): LiveWeatherState {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<WeatherObservationMeta[]>([])
  const [radarFrames, setRadarFrames] = useState<RadarObservation[]>([])
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteObservation[]>([])
  const [environment, setEnvironment] = useState<EnvironmentalSample | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        const [avail, radar, satellite, env] = await Promise.all([
          australianWeatherProvider.getAvailability(),
          australianWeatherProvider.getRadar({}),
          australianWeatherProvider.getSatellite({}),
          fetchOpenMeteoEnvironment(
            PROTOTYPE_STORM.latitude,
            PROTOTYPE_STORM.longitude,
            controller.signal,
          ),
        ])
        if (cancelled) return
        setAvailability(avail)
        setRadarFrames(radar.filter((f) => f.available && f.tileUrlTemplate))
        setSatelliteFrames(satellite.filter((f) => f.available && f.tileUrlTemplate))
        setEnvironment(env)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load live weather')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tick])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), RAINVIEWER.refreshMs)
    return () => window.clearInterval(id)
  }, [])

  return {
    loading,
    error,
    availability,
    radarFrames,
    satelliteFrames,
    environment,
    refresh: () => setTick((n) => n + 1),
  }
}
