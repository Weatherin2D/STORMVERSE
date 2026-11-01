import type { StormTrack } from '../types/observations'
import type { Provenance } from '../types/provenance'

export interface TruthCell {
  id: string
  stormId?: string
  longitude: number
  latitude: number
  observedAt: string
  sourceId: string
  label?: string
  provenance: Provenance
}

export interface TrackTruthMatch {
  trackId: string
  stormId: string
  truthCellId: string | null
  truthStormId?: string
  associated: boolean
  distanceKm: number | null
  timeDeltaSec: number | null
  /** 0–1 association score from stormId / distance / time gates. */
  score: number
  method: 'stormId' | 'nearest' | 'unmatched'
  provenance: Provenance
}

export interface TrackTruthSummary {
  truthConfigured: boolean
  truthCount: number
  trackCount: number
  associatedCount: number
  meanScore: number
  meanDistanceKm: number | null
  provenance: Provenance
}

export interface TruthMatchOptions {
  /** Spatial gate for nearest-neighbour association (km). */
  maxDistanceKm?: number
  /** Temporal gate using track mid-time vs truth observedAt (seconds). */
  maxTimeDeltaSec?: number
}

const DEFAULT_MAX_DISTANCE_KM = 50
const DEFAULT_MAX_TIME_DELTA_SEC = 90 * 60

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function trackMidpoint(track: StormTrack): {
  lon: number
  lat: number
  timeMs: number
} | null {
  const pts = track.points
  if (!pts.length) return null
  const mid = pts[Math.floor(pts.length / 2)]
  const timeMs = Date.parse(mid.time)
  if (!Number.isFinite(timeMs)) return null
  return { lon: mid.longitude, lat: mid.latitude, timeMs }
}

function pairScore(
  distanceKm: number,
  timeDeltaSec: number,
  maxDistanceKm: number,
  maxTimeDeltaSec: number,
  stormIdBonus: boolean,
): number {
  const spatial = clamp01(1 - distanceKm / Math.max(1e-6, maxDistanceKm))
  const temporal = clamp01(1 - timeDeltaSec / Math.max(1e-6, maxTimeDeltaSec))
  const base = 0.65 * spatial + 0.35 * temporal
  return clamp01(stormIdBonus ? Math.max(base, 0.85) : base)
}

const MATCH_PROVENANCE: Provenance = {
  kind: 'derived',
  summary:
    'Optional association of derived heuristic tracks to a user-supplied truth-cell catalogue — not official BoM verification skill.',
  sourceId: 'track-truth-hooks',
}

/**
 * Associate derived tracks with truth cells (stormId first, then gated nearest).
 * One-to-one greedy assignment by descending score.
 */
export function matchTracksToTruth(
  tracks: StormTrack[],
  truthCells: TruthCell[],
  options: TruthMatchOptions = {},
): TrackTruthMatch[] {
  const maxDistanceKm = options.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const maxTimeDeltaSec = options.maxTimeDeltaSec ?? DEFAULT_MAX_TIME_DELTA_SEC

  if (tracks.length === 0) return []

  type Candidate = {
    trackId: string
    truthId: string
    score: number
    distanceKm: number
    timeDeltaSec: number
    method: 'stormId' | 'nearest'
    truthStormId?: string
  }

  const candidates: Candidate[] = []

  for (const track of tracks) {
    const mid = trackMidpoint(track)
    if (!mid) continue

    for (const cell of truthCells) {
      const cellTime = Date.parse(cell.observedAt)
      if (!Number.isFinite(cellTime)) continue
      const distanceKm = haversineKm(mid.lon, mid.lat, cell.longitude, cell.latitude)
      const timeDeltaSec = Math.abs(mid.timeMs - cellTime) / 1000
      const stormIdHit =
        Boolean(cell.stormId) &&
        (cell.stormId === track.stormId || cell.stormId === track.id)

      if (!stormIdHit) {
        if (distanceKm > maxDistanceKm || timeDeltaSec > maxTimeDeltaSec) continue
      } else if (distanceKm > maxDistanceKm * 2.5) {
        // stormId match still requires a loose spatial sanity check
        continue
      }

      candidates.push({
        trackId: track.id,
        truthId: cell.id,
        score: pairScore(
          distanceKm,
          timeDeltaSec,
          maxDistanceKm,
          maxTimeDeltaSec,
          stormIdHit,
        ),
        distanceKm,
        timeDeltaSec,
        method: stormIdHit ? 'stormId' : 'nearest',
        truthStormId: cell.stormId,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const usedTracks = new Set<string>()
  const usedTruth = new Set<string>()
  const chosen = new Map<string, Candidate>()

  for (const c of candidates) {
    if (usedTracks.has(c.trackId) || usedTruth.has(c.truthId)) continue
    if (c.score < 0.2) continue
    usedTracks.add(c.trackId)
    usedTruth.add(c.truthId)
    chosen.set(c.trackId, c)
  }

  return tracks.map((track) => {
    const hit = chosen.get(track.id)
    if (!hit) {
      return {
        trackId: track.id,
        stormId: track.stormId,
        truthCellId: null,
        associated: false,
        distanceKm: null,
        timeDeltaSec: null,
        score: 0,
        method: 'unmatched',
        provenance: MATCH_PROVENANCE,
      } satisfies TrackTruthMatch
    }
    return {
      trackId: track.id,
      stormId: track.stormId,
      truthCellId: hit.truthId,
      truthStormId: hit.truthStormId,
      associated: true,
      distanceKm: hit.distanceKm,
      timeDeltaSec: hit.timeDeltaSec,
      score: hit.score,
      method: hit.method,
      provenance: MATCH_PROVENANCE,
    } satisfies TrackTruthMatch
  })
}

export function summarizeTrackTruth(
  matches: TrackTruthMatch[],
  truthCount: number,
  configured: boolean,
): TrackTruthSummary {
  const associated = matches.filter((m) => m.associated)
  const meanScore =
    matches.length === 0
      ? 0
      : matches.reduce((s, m) => s + m.score, 0) / matches.length
  const dists = associated
    .map((m) => m.distanceKm)
    .filter((d): d is number => d != null && Number.isFinite(d))
  const meanDistanceKm =
    dists.length === 0 ? null : dists.reduce((s, d) => s + d, 0) / dists.length

  return {
    truthConfigured: configured,
    truthCount,
    trackCount: matches.length,
    associatedCount: associated.length,
    meanScore,
    meanDistanceKm,
    provenance: {
      kind: 'derived',
      summary: configured
        ? `Compared ${matches.length} derived track(s) to ${truthCount} truth cell(s); ${associated.length} associated within gates.`
        : 'No truth-cell catalogue configured. Set VITE_TRUTH_CELLS_GEOJSON_URL or load the bundled sample.',
      sourceId: 'track-truth-hooks',
      qualityNote:
        'Association scores are geometric/temporal gates only — not published verification skill.',
    },
  }
}
