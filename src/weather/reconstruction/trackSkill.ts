import type { RadarObservation, StormTrack } from '../types/observations'
import type { Provenance } from '../types/provenance'

export type TrackSkillGrade = 'weak' | 'fair' | 'solid'

/**
 * Internal consistency proxies for derived tracks.
 * These are **not** formal skill scores against ground truth / BoM cells.
 */
export interface TrackSkillScore {
  trackId: string
  stormId: string
  /** Weighted 0–1 composite of the component proxies. */
  composite: number
  /** Fraction of the radar timeline spanned by the track. */
  coverage: number
  /** Penalises large time gaps between linked points. */
  continuity: number
  /** Higher when segment speeds are stable. */
  speedConsistency: number
  /** Higher when heading changes are modest between segments. */
  pathSmoothness: number
  grade: TrackSkillGrade
  pointCount: number
  meanSpeedKmh?: number
  provenance: Provenance
}

export interface TrackSkillSummary {
  trackCount: number
  meanComposite: number
  solidCount: number
  fairCount: number
  weakCount: number
  provenance: Provenance
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function pointUnix(iso: string): number {
  return Date.parse(iso) / 1000
}

function angleDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function gradeFor(score: number): TrackSkillGrade {
  if (score >= 0.62) return 'solid'
  if (score >= 0.42) return 'fair'
  return 'weak'
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const varSum = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(varSum)
}

/**
 * Score one derived track using geometric/temporal self-consistency only.
 */
export function scoreTrack(
  track: StormTrack,
  radarFrames: RadarObservation[],
): TrackSkillScore {
  const pts = track.points
  const times = pts.map((p) => pointUnix(p.time)).filter((t) => Number.isFinite(t))
  const frameTimes = radarFrames
    .map((f) => f.frameTimeUnix ?? pointUnix(f.observedAt))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  let coverage = clamp01(pts.length / Math.max(3, Math.min(8, radarFrames.length || 3)))
  if (frameTimes.length >= 2 && times.length >= 2) {
    const trackSpan = Math.max(1, times[times.length - 1] - times[0])
    const radarSpan = Math.max(1, frameTimes[frameTimes.length - 1] - frameTimes[0])
    coverage = clamp01(0.35 * coverage + 0.65 * (trackSpan / radarSpan))
  }

  let continuity = clamp01((pts.length - 1) / 5)
  if (times.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])
    const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
    const gapCv = meanGap > 0 ? stdev(gaps) / meanGap : 1
    // Prefer regular cadence; heavy gap variance hurts continuity.
    continuity = clamp01(1 - gapCv * 0.85) * clamp01(pts.length / 4)
  }

  const speeds = pts
    .map((p) => p.speedKmh)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0)
  let speedConsistency = 0.45
  let meanSpeedKmh: number | undefined
  if (speeds.length >= 1) {
    meanSpeedKmh = speeds.reduce((s, v) => s + v, 0) / speeds.length
    if (speeds.length >= 2) {
      const cv = meanSpeedKmh > 1 ? stdev(speeds) / meanSpeedKmh : stdev(speeds) / 10
      // Extreme speeds (>120) slightly down-weight as less plausible for mosaic centroids
      const plausibility = clamp01(1 - Math.max(0, (meanSpeedKmh - 90) / 120))
      speedConsistency = clamp01((1 - Math.min(1.2, cv)) * 0.85 + 0.15) * (0.7 + 0.3 * plausibility)
    } else {
      speedConsistency = clamp01(0.5 + (meanSpeedKmh < 80 ? 0.2 : 0))
    }
  }

  const bearings = pts
    .map((p) => p.bearingDeg)
    .filter((b): b is number => typeof b === 'number' && Number.isFinite(b))
  let pathSmoothness = 0.5
  if (bearings.length >= 2) {
    const turns: number[] = []
    for (let i = 1; i < bearings.length; i++) turns.push(angleDeltaDeg(bearings[i - 1], bearings[i]))
    const meanTurn = turns.reduce((s, t) => s + t, 0) / turns.length
    // Soft turns score higher; mean turn of 0→1, 90°→~0.25
    pathSmoothness = clamp01(1 - meanTurn / 120)
  } else if (pts.length >= 2) {
    pathSmoothness = 0.4
  }

  const composite = clamp01(
    0.28 * coverage +
      0.27 * continuity +
      0.25 * speedConsistency +
      0.2 * pathSmoothness,
  )

  return {
    trackId: track.id,
    stormId: track.stormId,
    composite,
    coverage,
    continuity,
    speedConsistency,
    pathSmoothness,
    grade: gradeFor(composite),
    pointCount: pts.length,
    meanSpeedKmh,
    provenance: {
      kind: 'derived',
      summary:
        'Heuristic tracking-quality proxies from track geometry and timing only — not formal skill vs truth data.',
      sourceId: 'track-skill-proxy',
      qualityNote:
        'No BoM/official cell verification. Scores measure self-consistency of the derived track heuristic.',
    },
  }
}

export function scoreTracks(
  tracks: StormTrack[],
  radarFrames: RadarObservation[],
): TrackSkillScore[] {
  return tracks
    .map((t) => scoreTrack(t, radarFrames))
    .sort((a, b) => b.composite - a.composite)
}

export function summarizeTrackSkills(scores: TrackSkillScore[]): TrackSkillSummary {
  const trackCount = scores.length
  const meanComposite =
    trackCount === 0 ? 0 : scores.reduce((s, x) => s + x.composite, 0) / trackCount
  return {
    trackCount,
    meanComposite,
    solidCount: scores.filter((s) => s.grade === 'solid').length,
    fairCount: scores.filter((s) => s.grade === 'fair').length,
    weakCount: scores.filter((s) => s.grade === 'weak').length,
    provenance: {
      kind: 'derived',
      summary:
        'Catalogue-level summary of heuristic track-quality proxies. Not a verification skill score.',
      sourceId: 'track-skill-proxy',
    },
  }
}
