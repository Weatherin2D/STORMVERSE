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

  private toRadarObservation(
    cat: RainViewerMapsResponse,
    frame: { time: number; path: string },
    summary: string,
  ): RadarObservation {
    return {
      id: `rv-radar-${frame.time}`,
      productType: 'radar_reflectivity',
      sourceId: this.id,
      observedAt: unixToIso(frame.time),
      available: true,
      coverage: { ...AUS_COVERAGE },
      units: 'relative reflectivity (colour scale)',
      tileUrlTemplate: rainViewerTileTemplate(cat.host, frame.path),
      framePath: frame.path,
      frameTimeUnix: frame.time,
      provenance: {
        kind: 'processed',
        summary,
        sourceId: this.id,
        observedAt: unixToIso(frame.time),
      },
    }
  }

  /** Live display: only the most recent observed radar frame (no history / nowcast). */
  async getRadar(_query: WeatherQuery): Promise<RadarObservation[]> {
    try {
      const cat = await this.catalog()
      const latest = cat.radar.past[cat.radar.past.length - 1]
      if (!latest) {
        return [
          {
            ...unavailableMeta(
              'aus-radar-reflectivity',
              'radar_reflectivity',
              this.id,
              'No RainViewer radar frames in catalog.',
            ),
            productType: 'radar_reflectivity',
          },
        ]
      }
      return [
        this.toRadarObservation(
          cat,
          latest,
          `${RAINVIEWER.attribution}. Current composite radar frame (latest only).`,
        ),
      ]
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

  /**
   * Recent past mosaics for heuristic track derivation only — not shown on the globe.
   * Excludes nowcast (extrapolated) frames.
   */
  async getRadarHistory(
    limit = 4,
    signal?: AbortSignal,
  ): Promise<RadarObservation[]> {
    try {
      const cat = await this.catalog(signal)
      const past = cat.radar.past.slice(-Math.max(1, limit))
      return past.map((frame) =>
        this.toRadarObservation(
          cat,
          frame,
          `${RAINVIEWER.attribution}. Past composite radar frame (track derivation only).`,
        ),
      )
    } catch {
      return []
    }
  }

  /** Live display: only the most recent infrared frame when published. */
  async getSatellite(_query: WeatherQuery): Promise<SatelliteObservation[]> {
    try {
      const cat = await this.catalog()
      const latest = cat.satellite.infrared[cat.satellite.infrared.length - 1]
      if (!latest) {
        return [
          {
            ...unavailableMeta(
              'aus-sat-infrared',
              'satellite_infrared',
              this.id,
              'Infrared satellite frames are not currently published in the RainViewer catalog.',
            ),
            productType: 'satellite_infrared',
          },
        ]
      }
      return [
        {
          id: `rv-sat-ir-${latest.time}`,
          productType: 'satellite_infrared',
          sourceId: this.id,
          observedAt: unixToIso(latest.time),
          available: true,
          coverage: { ...AUS_COVERAGE },
          band: 'infrared',
          tileUrlTemplate: rainViewerTileTemplate(cat.host, latest.path),
          framePath: latest.path,
          frameTimeUnix: latest.time,
          provenance: {
            kind: 'processed',
            summary: `${RAINVIEWER.attribution}. Current infrared satellite mosaic (latest only).`,
            sourceId: this.id,
            observedAt: unixToIso(latest.time),
          },
        },
      ]
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
