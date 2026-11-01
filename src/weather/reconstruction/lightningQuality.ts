import type {
  LightningClassification,
  LightningObservation,
} from '../types/observations'
import type { Provenance } from '../types/provenance'

export interface LightningQualityFilter {
  /** Inclusive minimum qualityScore; events without a score pass only when allowMissingQuality. */
  minQuality: number
  classifications: LightningClassification[] | 'all'
  allowMissingQuality: boolean
}

export interface LightningQualitySummary {
  total: number
  visible: number
  withQuality: number
  meanQuality: number | null
  cgCount: number
  icCount: number
  unknownClassCount: number
  highQualityCount: number
  provenance: Provenance
}

export const DEFAULT_LIGHTNING_FILTER: LightningQualityFilter = {
  minQuality: 0,
  classifications: 'all',
  allowMissingQuality: true,
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function normalizeQualityScore(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  // Accept 0–1 or 0–100 provider scales
  if (raw > 1 && raw <= 100) return clamp01(raw / 100)
  return clamp01(raw)
}

export function eventPassesLightningFilter(
  event: LightningObservation,
  filter: LightningQualityFilter,
): boolean {
  if (filter.classifications !== 'all' && !filter.classifications.includes(event.classification)) {
    return false
  }
  if (event.qualityScore == null) return filter.allowMissingQuality
  return event.qualityScore + 1e-9 >= filter.minQuality
}

export function filterLightningEvents(
  events: LightningObservation[],
  filter: LightningQualityFilter,
): LightningObservation[] {
  return events.filter((e) => eventPassesLightningFilter(e, filter))
}

export function summarizeLightningQuality(
  events: LightningObservation[],
  visible: LightningObservation[],
): LightningQualitySummary {
  const withQuality = events.filter((e) => e.qualityScore != null)
  const meanQuality =
    withQuality.length === 0
      ? null
      : withQuality.reduce((s, e) => s + (e.qualityScore ?? 0), 0) / withQuality.length

  return {
    total: events.length,
    visible: visible.length,
    withQuality: withQuality.length,
    meanQuality,
    cgCount: events.filter((e) => e.classification === 'cloud_to_ground').length,
    icCount: events.filter((e) => e.classification === 'intra_cloud').length,
    unknownClassCount: events.filter((e) => e.classification === 'unknown').length,
    highQualityCount: events.filter((e) => (e.qualityScore ?? 0) >= 0.75).length,
    provenance: {
      kind: 'direct',
      summary:
        'Lightning quality fields come from the configured GeoJSON feed when present. Filters are local UI gates — not a detection algorithm.',
      sourceId: 'lightning-quality',
      qualityNote: 'Sample / example feeds are plumbing fixtures, not live network detections.',
    },
  }
}

/** CSS-friendly colour hint from classification + quality for globe markers. */
export function lightningMarkerColor(event: LightningObservation): string {
  const q = event.qualityScore
  if (event.classification === 'cloud_to_ground') {
    if (q != null && q >= 0.75) return '#f0d060'
    if (q != null && q < 0.4) return '#c4a35a'
    return '#e8c27a'
  }
  if (event.classification === 'intra_cloud') {
    if (q != null && q >= 0.75) return '#b8d4f0'
    if (q != null && q < 0.4) return '#7a8aa0'
    return '#9eb6d4'
  }
  return '#d0d4dc'
}
