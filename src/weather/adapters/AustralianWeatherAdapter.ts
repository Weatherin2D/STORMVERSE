import { AUS_COVERAGE, RAINVIEWER } from '../../config/weather'
import type {
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
  WeatherObservationMeta,
} from '../types/observations'
import type { WeatherProvider, WeatherQuery } from '../providers/types'
import { unavailableMeta } from '../providers/types'
import {
  fetchRainViewerMaps,
  rainViewerTileTemplate,
  unixToIso,
} from './rainviewer/client'
import type { RainViewerMapsResponse } from './rainviewer/types'

/**
 * Australia-focused live observation adapter for Milestone 2.
 *
 * Uses the public RainViewer weather-maps API for radar (and infrared satellite
 * when the catalog provides frames). Does not scrape BoM or bypass access controls.
 *
 * Lightning cell tracks are not supplied by this provider — those remain unavailable
 * until a licensed lightning/track source is connected.
 */
export class AustralianWeatherProvider implements WeatherProvider {
  readonly id = 'australia-rainviewer'
  readonly displayName = 'Australian weather (RainViewer)'
  readonly regionFocus = 'Australia'
  readonly liveCapable = true

  private cache: RainViewerMapsResponse | null = null
  private cacheAt = 0
  private lastError: string | null = null

  async refresh(signal?: AbortSignal): Promise<RainViewerMapsResponse> {
    const data = await fetchRainViewerMaps(RAINVIEWER.catalogUrl, signal)
    this.cache = data
    this.cacheAt = Date.now()
    this.lastError = null
    return data
  }

  private async catalog(signal?: AbortSignal): Promise<RainViewerMapsResponse> {
    if (this.cache && Date.now() - this.cacheAt < RAINVIEWER.refreshMs) {
      return this.cache
    }
    try {
      return await this.refresh(signal)
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Catalog fetch failed'
      if (this.cache) return this.cache
      throw err
    }
  }

  async getAvailability(_query?: WeatherQuery): Promise<WeatherObservationMeta[]> {
    try {
      const cat = await this.catalog()
      const latestRadar =
        cat.radar.past.length > 0 ? cat.radar.past[cat.radar.past.length - 1] : undefined
      const latestSat =
        cat.satellite.infrared.length > 0
          ? cat.satellite.infrared[cat.satellite.infrared.length - 1]
          : undefined
      return [
        {
          id: 'aus-radar-reflectivity',
          productType: 'radar_reflectivity',
          sourceId: this.id,
          observedAt: latestRadar ? unixToIso(latestRadar.time) : new Date(0).toISOString(),
          available: cat.radar.past.length > 0,
          coverage: { ...AUS_COVERAGE },
          units: 'relative reflectivity (colour scale)',
          provenance: {
            kind: 'processed',
            summary: `${RAINVIEWER.attribution}. Composite radar imagery, not a BoM volume product.`,
            sourceId: this.id,
            observedAt: latestRadar ? unixToIso(latestRadar.time) : undefined,
          },
        },
        {
          id: 'aus-sat-infrared',
          productType: 'satellite_infrared',
          sourceId: this.id,
          observedAt: latestSat ? unixToIso(latestSat.time) : new Date(0).toISOString(),
          available: cat.satellite.infrared.length > 0,
          coverage: { ...AUS_COVERAGE },
          provenance: {
            kind: 'processed',
            summary: latestSat
              ? `${RAINVIEWER.attribution}. Infrared satellite mosaic.`
              : 'Infrared satellite frames are not currently published in the RainViewer catalog.',
            sourceId: this.id,
            observedAt: latestSat ? unixToIso(latestSat.time) : undefined,
          },
        },
        unavailableMeta(
          'aus-lightning',
          'lightning_event',
          this.id,
          'Detected lightning is not provided by the RainViewer public catalog. Storm-view flashes remain synthetic.',
        ),
        unavailableMeta(
          'aus-storm-track',
          'storm_track',
          this.id,
          'Automated storm-cell tracks are not derived in Milestone 2. The prototype marker is not a tracked cell.',
        ),
      ]
    } catch {
      return [
        unavailableMeta(
          'aus-radar-reflectivity',
          'radar_reflectivity',
          this.id,
          this.lastError ?? 'RainViewer catalog unavailable.',
        ),
        unavailableMeta(
          'aus-sat-infrared',
          'satellite_infrared',
          this.id,
          this.lastError ?? 'RainViewer catalog unavailable.',
        ),
      ]
    }
  }

  async getRadar(_query: WeatherQuery): Promise<RadarObservation[]> {
    try {
      const cat = await this.catalog()
      const frames = [...cat.radar.past, ...cat.radar.nowcast]
      return frames.map((frame, index) => ({
        id: `rv-radar-${frame.time}`,
        productType: 'radar_reflectivity' as const,
        sourceId: this.id,
        observedAt: unixToIso(frame.time),
        available: true,
        coverage: { ...AUS_COVERAGE },
        units: 'relative reflectivity (colour scale)',
        tileUrlTemplate: rainViewerTileTemplate(cat.host, frame.path),
        framePath: frame.path,
        frameTimeUnix: frame.time,
        provenance: {
          kind: 'processed' as const,
          summary:
            index >= cat.radar.past.length
              ? `${RAINVIEWER.attribution}. Nowcast frame (extrapolated) — not a direct observation.`
              : `${RAINVIEWER.attribution}. Past composite radar frame.`,
          sourceId: this.id,
          observedAt: unixToIso(frame.time),
        },
      }))
    } catch {
      return [
        {
          ...unavailableMeta(
            'aus-radar-reflectivity',
            'radar_reflectivity',
            this.id,
            this.lastError ?? 'Radar frames unavailable.',
          ),
          productType: 'radar_reflectivity',
        },
      ]
    }
  }

  async getSatellite(_query: WeatherQuery): Promise<SatelliteObservation[]> {
    try {
      const cat = await this.catalog()
      return cat.satellite.infrared.map((frame) => ({
        id: `rv-sat-ir-${frame.time}`,
        productType: 'satellite_infrared' as const,
        sourceId: this.id,
        observedAt: unixToIso(frame.time),
        available: true,
        coverage: { ...AUS_COVERAGE },
        band: 'infrared',
        tileUrlTemplate: rainViewerTileTemplate(cat.host, frame.path),
        framePath: frame.path,
        frameTimeUnix: frame.time,
        provenance: {
          kind: 'processed' as const,
          summary: `${RAINVIEWER.attribution}. Infrared satellite mosaic.`,
          sourceId: this.id,
          observedAt: unixToIso(frame.time),
        },
      }))
    } catch {
      return [
        {
          ...unavailableMeta(
            'aus-sat-infrared',
            'satellite_infrared',
            this.id,
            this.lastError ?? 'Satellite frames unavailable.',
          ),
          productType: 'satellite_infrared',
        },
      ]
    }
  }

  async getLightning(_query: WeatherQuery): Promise<LightningObservation[]> {
    return []
  }

  async getStormTracks(_query: WeatherQuery): Promise<StormTrack[]> {
    return []
  }
}

export const australianWeatherProvider = new AustralianWeatherProvider()
