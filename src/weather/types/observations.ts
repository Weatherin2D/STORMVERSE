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
  /** XYZ tile template with {z}/{x}/{y} when the product is imagery-based. */
  tileUrlTemplate?: string
  /** Provider path or asset id for this frame. */
  framePath?: string
  /** Unix seconds for this radar frame when known. */
  frameTimeUnix?: number
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
  tileUrlTemplate?: string
  framePath?: string
  frameTimeUnix?: number
}

/** Model / forecast environmental sample — not a direct observation. */
export interface EnvironmentalSample {
  id: string
  sourceId: string
  validAt: string
  longitude: number
  latitude: number
  temperatureC?: number
  relativeHumidityPct?: number
  windSpeedMps?: number
  precipitationMm?: number
  weatherCode?: number
  available: boolean
  provenance: Provenance
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
