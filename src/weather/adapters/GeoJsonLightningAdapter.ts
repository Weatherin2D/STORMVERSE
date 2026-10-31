import type { LightningObservation, WeatherObservationMeta } from '../types/observations'
import type { WeatherQuery } from '../providers/types'
import { AUS_COVERAGE } from '../../config/weather'

export interface LightningGeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number] | [number, number, number]
  }
  properties?: {
    id?: string
    time?: string
    observedAt?: string
    classification?: 'cloud_to_ground' | 'intra_cloud' | 'unknown'
    peakCurrentKa?: number
    source?: string
  }
}

export interface LightningGeoJson {
  type: 'FeatureCollection'
  features: LightningGeoJsonFeature[]
}

/**
 * Pluggable lightning provider.
 * Loads a FeatureCollection from a URL (env or argument). Never fabricates events.
 */
export class GeoJsonLightningProvider {
  readonly id = 'geojson-lightning'
  readonly displayName = 'Lightning GeoJSON feed'
  readonly liveCapable = true

  constructor(private url: string | null) {}

  configured(): boolean {
    return Boolean(this.url && this.url.trim())
  }

  async getAvailability(): Promise<WeatherObservationMeta> {
    if (!this.configured()) {
      return {
        id: 'lght-geojson',
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: new Date(0).toISOString(),
        available: false,
        coverage: { ...AUS_COVERAGE },
        provenance: {
          kind: 'direct',
          summary:
            'No lightning feed configured. Set VITE_LIGHTNING_GEOJSON_URL to a licensed FeatureCollection endpoint.',
          sourceId: this.id,
        },
      }
    }
    try {
      const events = await this.getLightning({})
      return {
        id: 'lght-geojson',
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: events[0]?.observedAt ?? new Date().toISOString(),
        available: events.length > 0,
        coverage: { ...AUS_COVERAGE },
        provenance: {
          kind: 'direct',
          summary: `Loaded ${events.length} lightning event(s) from configured GeoJSON feed.`,
          sourceId: this.id,
          observedAt: events[0]?.observedAt,
        },
      }
    } catch (err) {
      return {
        id: 'lght-geojson',
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: new Date(0).toISOString(),
        available: false,
        provenance: {
          kind: 'direct',
          summary: err instanceof Error ? err.message : 'Lightning feed failed',
          sourceId: this.id,
        },
      }
    }
  }

  async getLightning(query: WeatherQuery, signal?: AbortSignal): Promise<LightningObservation[]> {
    if (!this.configured()) return []
    const res = await fetch(this.url!, { signal, headers: { Accept: 'application/geo+json, application/json' } })
    if (!res.ok) throw new Error(`Lightning GeoJSON request failed (${res.status})`)
    const data = (await res.json()) as LightningGeoJson
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Lightning feed must be a GeoJSON FeatureCollection of Points')
    }

    let events = data.features
      .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
      .map((f, i) => {
        const [lon, lat, alt] = f.geometry.coordinates
        const observedAt = f.properties?.observedAt ?? f.properties?.time ?? new Date(0).toISOString()
        return {
          id: f.properties?.id ?? `lght-${i}-${observedAt}`,
          productType: 'lightning_event' as const,
          sourceId: f.properties?.source ?? this.id,
          observedAt: new Date(observedAt).toISOString(),
          available: true,
          longitude: lon,
          latitude: lat,
          altitudeM: alt,
          classification: f.properties?.classification ?? 'unknown',
          peakCurrentKa: f.properties?.peakCurrentKa,
          provenance: {
            kind: 'direct' as const,
            summary: 'Lightning event from configured GeoJSON feed.',
            sourceId: f.properties?.source ?? this.id,
            observedAt: new Date(observedAt).toISOString(),
          },
        } satisfies LightningObservation
      })

    if (query.range) {
      const start = Date.parse(query.range.start)
      const end = Date.parse(query.range.end)
      events = events.filter((e) => {
        const t = Date.parse(e.observedAt)
        return t >= start && t <= end
      })
    }
    return events
  }
}

export function createLightningProviderFromEnv(): GeoJsonLightningProvider {
  const url = (import.meta.env.VITE_LIGHTNING_GEOJSON_URL as string | undefined)?.trim() || null
  return new GeoJsonLightningProvider(url)
}
