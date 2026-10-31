import { useEffect, useMemo, useState } from 'react'
import { PROTOTYPE_STORM } from '../config/app'
import { RAINVIEWER } from '../config/weather'
import {
  australianWeatherProvider,
  createLightningProviderFromEnv,
  fetchOpenMeteoEnvironment,
  type LightningObservation,
  type RadarObservation,
  type SatelliteObservation,
  type StormTrack,
  type WeatherObservationMeta,
} from '../weather'
import type { EnvironmentalProfile } from '../weather/adapters/OpenMeteoAdapter'
import { deriveTracksFromRadarFrames } from '../weather/reconstruction/deriveTracks'

export interface LiveWeatherState {
  loading: boolean
  tracksLoading: boolean
  error: string | null
  availability: WeatherObservationMeta[]
  radarFrames: RadarObservation[]
  satelliteFrames: SatelliteObservation[]
  environment: EnvironmentalProfile | null
  tracks: StormTrack[]
  lightningEvents: LightningObservation[]
  lightningConfigured: boolean
  refresh: () => void
}

export function useLiveWeather(enableTracks: boolean): LiveWeatherState {
  const lightningProvider = useMemo(() => createLightningProviderFromEnv(), [])
  const [loading, setLoading] = useState(true)
  const [tracksLoading, setTracksLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<WeatherObservationMeta[]>([])
  const [radarFrames, setRadarFrames] = useState<RadarObservation[]>([])
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteObservation[]>([])
  const [environment, setEnvironment] = useState<EnvironmentalProfile | null>(null)
  const [tracks, setTracks] = useState<StormTrack[]>([])
  const [lightningEvents, setLightningEvents] = useState<LightningObservation[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        const [avail, radar, satellite, env, lghtMeta, lghtEvents] = await Promise.all([
          australianWeatherProvider.getAvailability(),
          australianWeatherProvider.getRadar({}),
          australianWeatherProvider.getSatellite({}),
          fetchOpenMeteoEnvironment(
            PROTOTYPE_STORM.latitude,
            PROTOTYPE_STORM.longitude,
            controller.signal,
          ),
          lightningProvider.getAvailability(),
          lightningProvider.getLightning({}, controller.signal).catch(() => [] as LightningObservation[]),
        ])
        if (cancelled) return
        const radarOk = radar.filter((f) => f.available && f.tileUrlTemplate)
        setAvailability([...avail.filter((a) => a.productType !== 'lightning_event'), lghtMeta])
        setRadarFrames(radarOk)
        setSatelliteFrames(satellite.filter((f) => f.available && f.tileUrlTemplate))
        setEnvironment(env)
        setLightningEvents(lghtEvents)
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
  }, [tick, lightningProvider])

  useEffect(() => {
    if (!enableTracks) {
      setTracks([])
      setTracksLoading(false)
      return
    }
    if (radarFrames.length < 2) return

    const controller = new AbortController()
    let cancelled = false
    setTracksLoading(true)

    deriveTracksFromRadarFrames(radarFrames, australianWeatherProvider.id, {
      frameLimit: 4,
      signal: controller.signal,
    })
      .then((derived) => {
        if (cancelled) return
        setTracks(derived)
        setAvailability((prev) => {
          const without = prev.filter((p) => p.id !== 'aus-storm-track')
          if (derived.length === 0) {
            return [
              ...without,
              {
                id: 'aus-storm-track',
                productType: 'storm_track',
                sourceId: australianWeatherProvider.id,
                observedAt: new Date().toISOString(),
                available: false,
                provenance: {
                  kind: 'derived',
                  summary:
                    'No multi-frame cell links found in the latest mosaics (or precip was too sparse).',
                  sourceId: australianWeatherProvider.id,
                },
              },
            ]
          }
          return [
            ...without,
            {
              id: 'aus-storm-track',
              productType: 'storm_track',
              sourceId: australianWeatherProvider.id,
              observedAt: derived[0].observedAt,
              available: true,
              provenance: {
                kind: 'derived',
                summary: `Derived ${derived.length} heuristic cell track(s) from RainViewer mosaics.`,
                sourceId: australianWeatherProvider.id,
              },
            },
          ]
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Cell track derivation failed', err)
        setTracks([])
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enableTracks, radarFrames])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), RAINVIEWER.refreshMs)
    return () => window.clearInterval(id)
  }, [])

  return {
    loading,
    tracksLoading,
    error,
    availability,
    radarFrames,
    satelliteFrames,
    environment,
    tracks,
    lightningEvents,
    lightningConfigured: lightningProvider.configured(),
    refresh: () => setTick((n) => n + 1),
  }
}
