import type { StormTrack, WeatherObservationMeta } from '../types/observations'
import type { TruthCell } from '../reconstruction/trackTruth'
import { AUS_COVERAGE, TRUTH_CELLS_FEED } from '../../config/weather'

interface TruthGeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number] | [number, number, number]
  }
  properties?: {
    id?: string
    stormId?: string
    time?: string
    observedAt?: string
    source?: string
    label?: string
    note?: string
    example?: boolean
  }
}

interface TruthGeoJson {
  type: 'FeatureCollection'
  features: TruthGeoJsonFeature[]
}

function parseFeatureCollection(data: unknown, sourceHint: string): TruthCell[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Truth cells feed must be a GeoJSON FeatureCollection of Points')
  }
  const fc = data as TruthGeoJson
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Truth cells feed must be a GeoJSON FeatureCollection of Points')
  }

  return fc.features
    .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f, i) => {
      const [lon, lat] = f.geometry.coordinates
      const observedAt = f.properties?.observedAt ?? f.properties?.time ?? new Date(0).toISOString()
      const sourceId = f.properties?.source ?? sourceHint
      const example = Boolean(f.properties?.example) || sourceId.includes('example')
      return {
        id: f.properties?.id ?? `truth-${i}-${observedAt}`,
        stormId: f.properties?.stormId,
        longitude: lon,
        latitude: lat,
        observedAt: new Date(observedAt).toISOString(),
        sourceId,
        label: f.properties?.label,
        provenance: {
          kind: 'direct' as const,
          summary: example
            ? 'Example truth cell for plumbing demos — not a licensed verification product.'
            : 'Truth cell from configured GeoJSON catalogue.',
          sourceId,
          observedAt: new Date(observedAt).toISOString(),
          qualityNote: f.properties?.note,
        },
      } satisfies TruthCell
    })
}

/**
 * Optional verification catalogue provider.
 * Loads Point features from a URL. Never fabricates truth cells.
 */
export class GeoJsonTruthCellsProvider {
  readonly id = 'geojson-truth-cells'
  readonly displayName = 'Truth cells GeoJSON catalogue'

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
        id: 'truth-cells-geojson',
        productType: 'storm_track',
        sourceId: this.id,
        observedAt: new Date(0).toISOString(),
        available: false,
        coverage: { ...AUS_COVERAGE },
        provenance: {
          kind: 'direct',
          summary:
            'No truth-cell catalogue configured. Set VITE_TRUTH_CELLS_GEOJSON_URL to a licensed FeatureCollection, or load the bundled sample for a plumbing demo.',
          sourceId: this.id,
        },
      }
    }
    try {
      const cells = await this.getTruthCells(signal)
      return {
        id: 'truth-cells-geojson',
        productType: 'storm_track',
        sourceId: this.id,
        observedAt: cells[0]?.observedAt ?? new Date().toISOString(),
        available: cells.length > 0,
        coverage: { ...AUS_COVERAGE },
        provenance: {
          kind: 'direct',
          summary: `Loaded ${cells.length} truth cell(s) from configured GeoJSON catalogue.`,
          sourceId: this.id,
          observedAt: cells[0]?.observedAt,
        },
      }
    } catch (err) {
      return {
        id: 'truth-cells-geojson',
        productType: 'storm_track',
        sourceId: this.id,
        observedAt: new Date(0).toISOString(),
        available: false,
        provenance: {
          kind: 'direct',
          summary: err instanceof Error ? err.message : 'Truth cells feed failed',
          sourceId: this.id,
        },
      }
    }
  }

  async getTruthCells(signal?: AbortSignal): Promise<TruthCell[]> {
    if (!this.configured()) return []
    const res = await fetch(this.url!, {
      signal,
      headers: { Accept: 'application/geo+json, application/json' },
    })
    if (!res.ok) throw new Error(`Truth cells GeoJSON request failed (${res.status})`)
    return parseFeatureCollection(await res.json(), this.id)
  }
}

export function createTruthCellsProviderFromEnv(): GeoJsonTruthCellsProvider {
  const url = (import.meta.env.VITE_TRUTH_CELLS_GEOJSON_URL as string | undefined)?.trim() || null
  return new GeoJsonTruthCellsProvider(url)
}

/** Bundled plumbing sample — explicitly not a verification product. */
export function sampleTruthCellsUrl(): string {
  return TRUTH_CELLS_FEED.samplePath
}

/**
 * Export derived tracks as a truth-cell FeatureCollection template.
 * Useful for wiring demos — label remains user-exported / not independent truth.
 */
export function tracksToTruthGeoJson(tracks: StormTrack[]): TruthGeoJson {
  return {
    type: 'FeatureCollection',
    features: tracks
      .filter((track) => track.points.length > 0)
      .map((track) => {
      const mid = track.points[Math.floor(track.points.length / 2)] ?? track.points[0]
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [mid.longitude, mid.latitude] as [number, number],
        },
        properties: {
          id: `export-${track.id}`,
          stormId: track.stormId,
          observedAt: mid.time,
          source: 'stormverse-derived-export',
          label: track.stormId,
          example: true,
          note: 'Exported from STORMVERSE derived tracks — stand-in catalogue only, not independent verification truth.',
        },
      }
    }),
  }
}

export function downloadTruthCellsTemplate(tracks: StormTrack[], filename?: string): void {
  const payload = `${JSON.stringify(tracksToTruthGeoJson(tracks), null, 2)}\n`
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = filename ?? `stormverse-truth-template-${stamp}.json`
  const blob = new Blob([payload], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Build in-memory truth cells from current derived tracks (stand-in only).
 * Used to exercise association plumbing without a licensed catalogue.
 */
export function truthCellsFromTracks(tracks: StormTrack[]): TruthCell[] {
  return tracksToTruthGeoJson(tracks).features.map((f, i) => {
    const [lon, lat] = f.geometry.coordinates
    const observedAt = f.properties?.observedAt ?? new Date(0).toISOString()
    return {
      id: f.properties?.id ?? `export-truth-${i}`,
      stormId: f.properties?.stormId,
      longitude: lon,
      latitude: lat,
      observedAt,
      sourceId: 'stormverse-derived-export',
      label: f.properties?.label,
      provenance: {
        kind: 'derived',
        summary:
          'Stand-in truth cells exported from current derived tracks — not an independent verification product.',
        sourceId: 'stormverse-derived-export',
        observedAt,
        qualityNote: f.properties?.note,
      },
    } satisfies TruthCell
  })
}
