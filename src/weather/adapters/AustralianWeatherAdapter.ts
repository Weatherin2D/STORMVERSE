import type {
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
  WeatherObservationMeta,
} from '../types/observations'
import type { WeatherProvider, WeatherQuery } from '../providers/types'
import { unavailableMeta } from '../providers/types'

/**
 * Stub for future Australian radar / satellite / lightning integration.
 * Returns unavailable products with clear messaging — never fabricates live data.
 */
export class AustralianWeatherProvider implements WeatherProvider {
  readonly id = 'australia-bom-path'
  readonly displayName = 'Australian Weather (stub)'
  readonly regionFocus = 'Australia'
  readonly liveCapable = false

  private note =
    'Australian observation adapters are prepared for Milestone 2. No live BoM or commercial feeds are connected in Milestone 1.'

  async getAvailability(_query?: WeatherQuery): Promise<WeatherObservationMeta[]> {
    return [
      unavailableMeta('aus-radar', 'radar_volume', this.id, this.note),
      unavailableMeta('aus-sat', 'satellite_infrared', this.id, this.note),
      unavailableMeta('aus-lght', 'lightning_event', this.id, this.note),
      unavailableMeta('aus-track', 'storm_track', this.id, this.note),
    ]
  }

  async getRadar(_query: WeatherQuery): Promise<RadarObservation[]> {
    return [
      {
        ...unavailableMeta('aus-radar', 'radar_volume', this.id, this.note),
        productType: 'radar_volume',
      },
    ]
  }

  async getSatellite(_query: WeatherQuery): Promise<SatelliteObservation[]> {
    return [
      {
        ...unavailableMeta('aus-sat', 'satellite_infrared', this.id, this.note),
        productType: 'satellite_infrared',
      },
    ]
  }

  async getLightning(_query: WeatherQuery): Promise<LightningObservation[]> {
    return []
  }

  async getStormTracks(_query: WeatherQuery): Promise<StormTrack[]> {
    return []
  }
}

export const australianWeatherProvider = new AustralianWeatherProvider()
