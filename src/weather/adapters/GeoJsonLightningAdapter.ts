import type {
  LightningClassification,
  LightningObservation,
  LightningPolarity,
  WeatherObservationMeta,
} from '../types/observations'
import type { WeatherQuery } from '../providers/types'
import { AUS_COVERAGE, LIGHTNING_FEED } from '../../config/weather'
import { normalizeQualityScore } from '../reconstruction/lightningQuality'

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
    classification?: LightningClassification
    peakCurrentKa?: number
    source?: string
    network?: string
    qualityScore?: number
    quality?: number | string
    confidence?: number
    polarity?: LightningPolarity | string
    multiplicity?: number
    locationErrorKm?: number
    errorEllipseKm?: number
    note?: string
    example?: boolean
  }
}

export interface LightningGeoJson {
  type: 'FeatureCollection'
  features: LightningGeoJsonFeature[]
}

function parsePolarity(raw: unknown): LightningPolarity | undefined {
  if (raw === 'positive' || raw === 'negative' || raw === 'unknown') return raw
  if (typeof raw === 'string') {
    const s = raw.toLowerCase()
    if (s === '+' || s === 'pos' || s === 'positive') return 'positive'
    if (s === '-' || s === 'neg' || s === 'negative') return 'negative'
  }
  return undefined
}

function parseClassification(raw: unknown): LightningClassification {
  if (raw === 'cloud_to_ground' || raw === 'intra_cloud' || raw === 'unknown') return raw
  if (typeof raw === 'string') {
    const s = raw.toLowerCase().replace(/[\s-]+/g, '_')
    if (s === 'cg' || s === 'cloud_to_ground') return 'cloud_to_ground'
    if (s === 'ic' || s === 'intra_cloud' || s === 'cloud_flash') return 'intra_cloud'
  }
  return 'unknown'
}

function parseFeatureCollection(data: unknown, sourceHint: string): LightningObservation[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Lightning feed must be a GeoJSON FeatureCollection of Points')
  }
  const fc = data as LightningGeoJson
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Lightning feed must be a GeoJSON FeatureCollection of Points')
  }

  return fc.features
    .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f, i) => {
      const [lon, lat, alt] = f.geometry.coordinates
      const observedAt = f.properties?.observedAt ?? f.properties?.time ?? new Date(0).toISOString()
      const sourceId = f.properties?.source ?? sourceHint
      const example = Boolean(f.properties?.example) || sourceId.includes('example')
      const qualityScore = normalizeQualityScore(
        f.properties?.qualityScore ?? f.properties?.confidence ?? f.properties?.quality,
      )
      const locationErrorKm =
        typeof f.properties?.locationErrorKm === 'number'
          ? f.properties.locationErrorKm
          : typeof f.properties?.errorEllipseKm === 'number'
            ? f.properties.errorEllipseKm
            : undefined

      return {
        id: f.properties?.id ?? `lght-${i}-${observedAt}`,
        productType: 'lightning_event' as const,
        sourceId,
        observedAt: new Date(observedAt).toISOString(),
        available: true,
        longitude: lon,
        latitude: lat,
        altitudeM: alt,
        classification: parseClassification(f.properties?.classification),
        peakCurrentKa: f.properties?.peakCurrentKa,
        qualityScore,
        network: f.properties?.network,
        polarity: parsePolarity(f.properties?.polarity),
        multiplicity:
          typeof f.properties?.multiplicity === 'number' ? f.properties.multiplicity : undefined,
        locationErrorKm,
        quality:
          qualityScore != null
            ? `quality ${Math.round(qualityScore * 100)}%`
            : typeof f.properties?.quality === 'string'
              ? f.properties.quality
              : undefined,
        provenance: {
          kind: 'direct' as const,
          summary: example
            ? 'Example lightning event for plumbing demos — not a live network detection.'
            : 'Lightning event from configured GeoJSON feed.',
          sourceId,
          observedAt: new Date(observedAt).toISOString(),
          qualityNote: f.properties?.note,
        },
      } satisfies LightningObservation
    })
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

  setUrl(url: string | null): void {
    this.url = url?.trim() || null
  }

  getUrl(): string | null {
    return this.url
  }

  async getAvailability(signal?: AbortSignal): Promise<WeatherObservationMeta> {
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
            'No lightning feed configured. Set VITE_LIGHTNING_GEOJSON_URL to a licensed FeatureCollection, or load the bundled sample for a quality-metadata demo.',
          sourceId: this.id,
        },
      }
    }
    try {
      const events = await this.getLightning({}, signal)
      const withQuality = events.filter((e) => e.qualityScore != null).length
      return {
        id: 'lght-geojson',
        productType: 'lightning_event',
        sourceId: this.id,
        observedAt: events[0]?.observedAt ?? new Date().toISOString(),
        available: events.length > 0,
        coverage: { ...AUS_COVERAGE },
        provenance: {
          kind: 'direct',
          summary: `Loaded ${events.length} lightning event(s) from configured GeoJSON feed (${withQuality} with qualityScore).`,
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
    const res = await fetch(this.url!, {
      signal,
      headers: { Accept: 'application/geo+json, application/json' },
    })
    if (!res.ok) throw new Error(`Lightning GeoJSON request failed (${res.status})`)
    let events = parseFeatureCollection(await res.json(), this.id)

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

export function sampleLightningUrl(): string {
  return LIGHTNING_FEED.samplePath
}
