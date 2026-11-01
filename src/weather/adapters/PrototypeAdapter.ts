import { PROTOTYPE_STORM, TIMELINE } from '../../config/app'
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
 * Synthetic demonstration provider.
 * Emits prototype lightning events for the timeline — never labelled as live data.
 */
export class PrototypeWeatherProvider implements WeatherProvider {
  readonly id = 'prototype'
  readonly displayName = 'Prototype Simulation'
  readonly regionFocus = 'Demonstration demonstration (Australia-framed)'
  readonly liveCapable = false

  private baseTime = Date.UTC(2024, 10, 15, 6, 0, 0)

  async getAvailability(): Promise<WeatherObservationMeta[]> {
    return [
      {
        id: 'proto-lightning-stream',
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: new Date(this.baseTime).toISOString(),
        available: true,
        provenance: {
          kind: 'synthetic',
          summary: 'Synthetic lightning for prototype illumination and timeline demos.',
          sourceId: this.id,
        },
      },
      unavailableMeta(
        'proto-radar',
        'radar_volume',
        this.id,
        'Radar volumes are not supplied by the prototype provider.',
      ),
    ]
  }

  async getRadar(): Promise<RadarObservation[]> {
    return [
      {
        id: 'proto-radar-none',
        productType: 'radar_volume',
        sourceId: this.id,
        observedAt: new Date(this.baseTime).toISOString(),
        available: false,
        provenance: {
          kind: 'synthetic',
          summary: 'No radar grid — visual rain shafts are procedural only.',
          sourceId: this.id,
        },
      },
    ]
  }

  async getSatellite(): Promise<SatelliteObservation[]> {
    return [
      {
        id: 'proto-sat-none',
        productType: 'satellite_infrared',
        sourceId: this.id,
        observedAt: new Date(this.baseTime).toISOString(),
        available: false,
        provenance: {
          kind: 'synthetic',
          summary: 'Satellite imagery not available in Milestone 1.',
          sourceId: this.id,
        },
      },
    ]
  }

  async getLightning(query: WeatherQuery): Promise<LightningObservation[]> {
    const events: LightningObservation[] = []
    const seed = 7
    for (let i = 0; i < 48; i++) {
      const t = (i / 47) * TIMELINE.durationSec
      const jitter = pseudoRandom(seed + i)
      const lon =
        PROTOTYPE_STORM.longitude + (pseudoRandom(seed * 3 + i) - 0.5) * 0.35
      const lat =
        PROTOTYPE_STORM.latitude + (pseudoRandom(seed * 5 + i) - 0.5) * 0.28
      const classification = jitter > 0.55 ? 'cloud_to_ground' : 'intra_cloud'
      const qualityScore = 0.35 + jitter * 0.6
      events.push({
        id: `proto-lght-${i}`,
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: new Date(this.baseTime + t * 1000).toISOString(),
        available: true,
        longitude: lon,
        latitude: lat,
        altitudeM: 4000 + jitter * 8000,
        classification,
        peakCurrentKa:
          classification === 'cloud_to_ground' ? (jitter > 0.7 ? 28 : -18) * (0.6 + jitter) : undefined,
        qualityScore,
        network: 'prototype-synthetic',
        polarity:
          classification === 'cloud_to_ground'
            ? jitter > 0.7
              ? 'positive'
              : 'negative'
            : 'unknown',
        multiplicity: classification === 'cloud_to_ground' ? 1 + Math.floor(jitter * 4) : undefined,
        locationErrorKm: 0.5 + (1 - qualityScore) * 3,
        provenance: {
          kind: 'synthetic',
          summary: 'Synthetic lightning event for visual prototype.',
          sourceId: this.id,
          observedAt: new Date(this.baseTime + t * 1000).toISOString(),
        },
      })
    }

    if (query.range) {
      const start = Date.parse(query.range.start)
      const end = Date.parse(query.range.end)
      return events.filter((e) => {
        const t = Date.parse(e.observedAt)
        return t >= start && t <= end
      })
    }
    return events
  }

  async getStormTracks(): Promise<StormTrack[]> {
    const points = Array.from({ length: 7 }, (_, i) => {
      const t = (i / 6) * TIMELINE.durationSec
      return {
        time: new Date(this.baseTime + t * 1000).toISOString(),
        longitude: PROTOTYPE_STORM.longitude + i * 0.04,
        latitude: PROTOTYPE_STORM.latitude + i * 0.02,
        speedKmh: 28 + i * 2,
        bearingDeg: 55,
      }
    })
    return [
      {
        id: 'proto-track-1',
        productType: 'storm_track',
        sourceId: this.id,
        stormId: PROTOTYPE_STORM.id,
        observedAt: points[0].time,
        available: true,
        points,
        confidence: 0,
        provenance: {
          kind: 'synthetic',
          summary: 'Illustrative track for the prototype storm only.',
          sourceId: this.id,
        },
      },
    ]
  }

  /** Map simulation seconds [0, duration] to ISO time in the prototype window. */
  simTimeToIso(simSec: number): string {
    return new Date(this.baseTime + simSec * 1000).toISOString()
  }

  getBaseTimeIso(): string {
    return new Date(this.baseTime).toISOString()
  }
}

function pseudoRandom(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export const prototypeProvider = new PrototypeWeatherProvider()
