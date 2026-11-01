import type { LightningObservation, StormTrack } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { TrackSkillSummary } from './trackSkill'
import type { TrackTruthSummary } from './trackTruth'
import { haversineKm } from './trackTruth'
import type { LightningQualitySummary } from './lightningQuality'

export interface CrossProductInputs {
  radarObservedAt?: string | null
  radarFrameCount: number
  tracks: StormTrack[]
  trackSkillSummary: TrackSkillSummary | null
  truthSummary: TrackTruthSummary | null
  lightningConfigured: boolean
  lightningAll: LightningObservation[]
  lightningVisible: LightningObservation[]
  lightningSummary: LightningQualitySummary | null
  selectedTrackId: string | null
  /** Half-window around radar observation time for lightning co-timing (seconds). */
  timeWindowSec?: number
  /** Spatial gate from selected-track midpoint to lightning (km). */
  nearTrackKm?: number
}

export interface CrossProductFeedStatus {
  id: 'radar' | 'tracks' | 'lightning' | 'truth'
  label: string
  ready: boolean
  detail: string
}

export interface CrossProductReport {
  feeds: CrossProductFeedStatus[]
  radarObservedAt?: string
  lightningInTimeWindow: number
  lightningNearSelected: number
  selectedTrackId: string | null
  selectedStormId: string | null
  /** 0–1 exploratory co-location hint — not a verification metric. */
  coherenceHint: number
  coherenceLabel: 'sparse' | 'mixed' | 'aligned'
  timeWindowSec: number
  nearTrackKm: number
  provenance: Provenance
}

export const DEFAULT_CROSS_PRODUCT_TIME_WINDOW_SEC = 15 * 60
export const DEFAULT_CROSS_PRODUCT_NEAR_TRACK_KM = 40

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function trackMid(track: StormTrack): { lon: number; lat: number; timeMs: number } | null {
  const pts = track.points
  if (!pts.length) return null
  const mid = pts[Math.floor(pts.length / 2)]
  const timeMs = Date.parse(mid.time)
  if (!Number.isFinite(timeMs)) return null
  return { lon: mid.longitude, lat: mid.latitude, timeMs }
}

export function lightningInObservationWindow(
  events: LightningObservation[],
  observedAt: string | null | undefined,
  windowSec: number,
): LightningObservation[] {
  if (!observedAt) return []
  const center = Date.parse(observedAt)
  if (!Number.isFinite(center)) return []
  const half = Math.max(0, windowSec) * 1000
  return events.filter((e) => {
    const t = Date.parse(e.observedAt)
    return Number.isFinite(t) && Math.abs(t - center) <= half
  })
}

export function lightningNearTrack(
  events: LightningObservation[],
  track: StormTrack | null,
  maxKm: number,
): LightningObservation[] {
  if (!track) return []
  const mid = trackMid(track)
  if (!mid) return []
  return events.filter(
    (e) => haversineKm(mid.lon, mid.lat, e.longitude, e.latitude) <= maxKm,
  )
}

function coherenceLabel(score: number): CrossProductReport['coherenceLabel'] {
  if (score >= 0.62) return 'aligned'
  if (score >= 0.32) return 'mixed'
  return 'sparse'
}

/**
 * Summarise cross-product readiness and exploratory co-location hints.
 * Never fabricates missing observations; scores are UI coherence hints only.
 */
export function buildCrossProductReport(input: CrossProductInputs): CrossProductReport {
  const timeWindowSec = input.timeWindowSec ?? DEFAULT_CROSS_PRODUCT_TIME_WINDOW_SEC
  const nearTrackKm = input.nearTrackKm ?? DEFAULT_CROSS_PRODUCT_NEAR_TRACK_KM
  const selected =
    input.tracks.find((t) => t.id === input.selectedTrackId) ??
    input.tracks[0] ??
    null

  const inTime = lightningInObservationWindow(
    input.lightningVisible,
    input.radarObservedAt,
    timeWindowSec,
  )
  const nearSelected = lightningNearTrack(input.lightningVisible, selected, nearTrackKm)
  const nearAndTimed = lightningNearTrack(inTime, selected, nearTrackKm)

  const feeds: CrossProductFeedStatus[] = [
    {
      id: 'radar',
      label: 'Radar mosaic',
      ready: input.radarFrameCount > 0,
      detail: input.radarFrameCount > 0
        ? `${input.radarFrameCount} frame(s)${input.radarObservedAt ? ` · ${input.radarObservedAt}` : ''}`
        : 'No mosaic frames',
    },
    {
      id: 'tracks',
      label: 'Derived tracks',
      ready: input.tracks.length > 0,
      detail:
        input.tracks.length > 0
          ? `${input.tracks.length} track(s)${
              input.trackSkillSummary
                ? ` · skill mean ${Math.round(input.trackSkillSummary.meanComposite * 100)}%`
                : ''
            }`
          : 'No derived cells',
    },
    {
      id: 'lightning',
      label: 'Lightning feed',
      ready: input.lightningConfigured && input.lightningAll.length > 0,
      detail: input.lightningConfigured
        ? `${input.lightningVisible.length}/${input.lightningAll.length} visible${
            input.lightningSummary?.meanQuality != null
              ? ` · mean Q ${Math.round(input.lightningSummary.meanQuality * 100)}%`
              : ''
          }`
        : 'Not configured',
    },
    {
      id: 'truth',
      label: 'Truth catalogue',
      ready: Boolean(input.truthSummary?.truthConfigured && input.truthSummary.truthCount > 0),
      detail: input.truthSummary?.truthConfigured
        ? `${input.truthSummary.associatedCount}/${input.truthSummary.trackCount} associated`
        : 'Not configured',
    },
  ]

  const readyCount = feeds.filter((f) => f.ready).length
  const timeFrac =
    input.lightningVisible.length === 0
      ? 0
      : inTime.length / input.lightningVisible.length
  const nearFrac =
    input.lightningVisible.length === 0 || !selected
      ? 0
      : nearSelected.length / input.lightningVisible.length
  const jointFrac =
    input.lightningVisible.length === 0 || !selected
      ? 0
      : nearAndTimed.length / Math.max(1, input.lightningVisible.length)
  const truthFrac = input.truthSummary?.truthConfigured
    ? input.truthSummary.trackCount > 0
      ? input.truthSummary.associatedCount / input.truthSummary.trackCount
      : 0
    : 0

  const coherenceHint = clamp01(
    0.25 * (readyCount / feeds.length) +
      0.3 * timeFrac +
      0.25 * nearFrac +
      0.1 * jointFrac +
      0.1 * truthFrac,
  )

  return {
    feeds,
    radarObservedAt: input.radarObservedAt ?? undefined,
    lightningInTimeWindow: inTime.length,
    lightningNearSelected: nearSelected.length,
    selectedTrackId: selected?.id ?? null,
    selectedStormId: selected?.stormId ?? null,
    coherenceHint,
    coherenceLabel: coherenceLabel(coherenceHint),
    timeWindowSec,
    nearTrackKm,
    provenance: {
      kind: 'derived',
      summary:
        'Cross-product coherence hints combine feed readiness with optional lightning↔radar time and lightning↔track distance gates. Not formal multi-sensor verification.',
      sourceId: 'cross-product-quality',
      qualityNote: 'Missing licensed feeds stay unavailable — gaps are never filled with fabricated observations.',
      observedAt: input.radarObservedAt ?? undefined,
    },
  }
}
