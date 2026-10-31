import type { Provenance } from './provenance'

export type ProductType =
  | 'radar_reflectivity'
  | 'radar_volume'
  | 'satellite_visible'
  | 'satellite_infrared'
  | 'lightning_event'
  | 'storm_track'
  | 'surface_obs'
  | 'impact_report'

export interface GeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface WeatherObservationMeta {
  id: string
  productType: ProductType
  sourceId: string
  observedAt: string
  available: boolean
  coverage?: GeoBounds
  units?: string
  quality?: string
  provenance: Provenance
}

export interface RadarObservation extends WeatherObservationMeta {
  productType: 'radar_reflectivity' | 'radar_volume'
  /** Reflectivity grid placeholder — never fabricate live values. */
  elevationAngleDeg?: number
  verticalLevels?: number
  grid?: {
    cols: number
    rows: number
    levels?: number
    /** Row-major reflectivity (dBZ) when available. */
    values?: Float32Array
  }
}

export interface SatelliteObservation extends WeatherObservationMeta {
  productType: 'satellite_visible' | 'satellite_infrared'
  imageUrl?: string
  band?: string
}

export type LightningClassification =
  | 'cloud_to_ground'
  | 'intra_cloud'
  | 'unknown'

export interface LightningObservation extends WeatherObservationMeta {
  productType: 'lightning_event'
  longitude: number
  latitude: number
  altitudeM?: number
  classification: LightningClassification
  peakCurrentKa?: number
}

export interface StormTrackPoint {
  time: string
  longitude: number
  latitude: number
  speedKmh?: number
  bearingDeg?: number
}

export interface StormTrack extends WeatherObservationMeta {
  productType: 'storm_track'
  stormId: string
  points: StormTrackPoint[]
  confidence?: number
}

export type WeatherProduct =
  | RadarObservation
  | SatelliteObservation
  | LightningObservation
  | StormTrack
  | WeatherObservationMeta
