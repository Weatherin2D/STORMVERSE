import type {
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
  WeatherObservationMeta,
} from '../types/observations'

export interface TimeRange {
  start: string
  end: string
}

export interface WeatherQuery {
  time?: string
  range?: TimeRange
  bounds?: {
    west: number
    south: number
    east: number
    north: number
  }
  stormId?: string
}

export interface WeatherProvider {
  readonly id: string
  readonly displayName: string
  readonly regionFocus: string
  /** True when this provider can return real observations. */
  readonly liveCapable: boolean

  getAvailability(query?: WeatherQuery): Promise<WeatherObservationMeta[]>
  getRadar(query: WeatherQuery): Promise<RadarObservation[]>
  getSatellite(query: WeatherQuery): Promise<SatelliteObservation[]>
  getLightning(query: WeatherQuery): Promise<LightningObservation[]>
  getStormTracks(query: WeatherQuery): Promise<StormTrack[]>
}

export function unavailableMeta(
  id: string,
  productType: WeatherObservationMeta['productType'],
  sourceId: string,
  summary: string,
): WeatherObservationMeta {
  return {
    id,
    productType,
    sourceId,
    observedAt: new Date(0).toISOString(),
    available: false,
    provenance: {
      kind: 'synthetic',
      summary,
      sourceId,
    },
  }
}
