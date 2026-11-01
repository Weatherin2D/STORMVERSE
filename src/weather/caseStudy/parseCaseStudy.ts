import { parseLightningFeatureCollection } from '../adapters/GeoJsonLightningAdapter'
import { parseTruthFeatureCollection } from '../adapters/GeoJsonTruthCellsAdapter'
import type { StormTrack, StormTrackPoint } from '../types/observations'
import type { Provenance, ProvenanceKind } from '../types/provenance'
import { CASE_STUDY_VERSION, type CaseStudyPack } from './types'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function parseProvenance(raw: unknown, fallback: Provenance): Provenance {
  const o = asRecord(raw)
  if (!o || typeof o.summary !== 'string') return fallback
  const kind = (typeof o.kind === 'string' ? o.kind : fallback.kind) as ProvenanceKind
  return {
    kind,
    summary: o.summary,
    sourceId: typeof o.sourceId === 'string' ? o.sourceId : fallback.sourceId,
    observedAt: typeof o.observedAt === 'string' ? o.observedAt : fallback.observedAt,
    qualityNote: typeof o.qualityNote === 'string' ? o.qualityNote : fallback.qualityNote,
  }
}

function parseTrackPoint(raw: unknown): StormTrackPoint | null {
  const o = asRecord(raw)
  if (!o) return null
  if (typeof o.time !== 'string') return null
  if (typeof o.longitude !== 'number' || typeof o.latitude !== 'number') return null
  return {
    time: o.time,
    longitude: o.longitude,
    latitude: o.latitude,
    speedKmh: typeof o.speedKmh === 'number' ? o.speedKmh : undefined,
    bearingDeg: typeof o.bearingDeg === 'number' ? o.bearingDeg : undefined,
  }
}

function parseTracks(raw: unknown, sourceId: string): StormTrack[] {
  if (!Array.isArray(raw)) return []
  const tracks: StormTrack[] = []
  raw.forEach((item, i) => {
    const o = asRecord(item)
    if (!o) return
    const points = Array.isArray(o.points)
      ? o.points.map(parseTrackPoint).filter((p): p is StormTrackPoint => p != null)
      : []
    if (points.length === 0) return
    const observedAt =
      typeof o.observedAt === 'string' ? o.observedAt : points[0]?.time ?? new Date(0).toISOString()
    const stormId = typeof o.stormId === 'string' ? o.stormId : `case-cell-${i}`
    tracks.push({
      id: typeof o.id === 'string' ? o.id : `case-track-${i}`,
      stormId,
      productType: 'storm_track',
      sourceId: typeof o.sourceId === 'string' ? o.sourceId : sourceId,
      observedAt,
      available: true,
      points,
      confidence: typeof o.confidence === 'number' ? o.confidence : 0.55,
      provenance: parseProvenance(o.provenance, {
        kind: 'synthetic',
        summary:
          'Case-study reference track — archived/example geometry, not a live derived RainViewer cell.',
        sourceId,
        observedAt,
      }),
    })
  })
  return tracks
}

/**
 * Parse a STORMVERSE multi-sensor case-study pack.
 * Never invents missing sensors — absent collections become empty arrays.
 */
export function parseCaseStudyPack(raw: unknown, sourcePath?: string): CaseStudyPack | null {
  const o = asRecord(raw)
  if (!o) return null
  if (o.version !== CASE_STUDY_VERSION) return null
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null
  if (typeof o.region !== 'string' || typeof o.focusObservedAt !== 'string') return null
  const focus = asRecord(o.focus)
  const range = asRecord(o.timeRange)
  if (!focus || typeof focus.longitude !== 'number' || typeof focus.latitude !== 'number') return null
  if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return null

  const sourceId = 'case-study-pack'
  const provenance = parseProvenance(o.provenance, {
    kind: 'synthetic',
    summary:
      'Bundled multi-sensor case-study pack for plumbing demos — not a licensed BoM/commercial archive.',
    sourceId,
    observedAt: o.focusObservedAt,
  })

  const lightning = o.lightning
    ? parseLightningFeatureCollection(o.lightning, `${sourceId}-lightning`)
    : []
  const truthCells = o.truthCells
    ? parseTruthFeatureCollection(o.truthCells, `${sourceId}-truth`)
    : []
  const tracks = parseTracks(o.tracks, `${sourceId}-tracks`)

  // Stamp example provenance on lightning/truth when pack is synthetic
  const stampedLightning = lightning.map((e) => ({
    ...e,
    provenance: {
      ...e.provenance,
      summary:
        e.provenance.summary.includes('Example') || e.provenance.summary.includes('example')
          ? e.provenance.summary
          : 'Case-study lightning event — example/archive fixture, not a live network detection.',
      sourceId: e.sourceId || `${sourceId}-lightning`,
    },
  }))

  return {
    version: CASE_STUDY_VERSION,
    id: o.id,
    title: o.title,
    region: o.region,
    focusObservedAt: o.focusObservedAt,
    timeRange: { start: range.start, end: range.end },
    focus: { longitude: focus.longitude, latitude: focus.latitude },
    provenance,
    sourcePath,
    lightning: stampedLightning,
    truthCells,
    tracks,
  }
}

export async function fetchCaseStudyPack(
  url: string,
  signal?: AbortSignal,
): Promise<CaseStudyPack> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Case study request failed (${res.status})`)
  const parsed = parseCaseStudyPack(await res.json(), url)
  if (!parsed) throw new Error('Invalid STORMVERSE case-study pack')
  return parsed
}
