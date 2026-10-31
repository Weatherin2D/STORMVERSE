import type { RadarObservation, StormTrack } from '../types/observations'

export interface TrackPose {
  longitude: number
  latitude: number
  /** 0 at first track point → 1 at last. */
  progress: number
  speedKmh?: number
  bearingDeg?: number
  /** ISO time of the interpolated sample. */
  time: string
  /** True when the radar cursor is outside the track’s observed lifetime. */
  clamped: boolean
}

function pointUnix(iso: string): number {
  return Date.parse(iso) / 1000
}

/**
 * Map a fractional radar-frame cursor to a unix observation time.
 */
export function radarCursorToUnix(frames: RadarObservation[], cursor: number): number | null {
  if (frames.length === 0) return null
  const i0 = Math.max(0, Math.min(frames.length - 1, Math.floor(cursor)))
  const i1 = Math.min(frames.length - 1, i0 + 1)
  const t0 = frames[i0].frameTimeUnix ?? pointUnix(frames[i0].observedAt)
  const t1 = frames[i1].frameTimeUnix ?? pointUnix(frames[i1].observedAt)
  if (!Number.isFinite(t0)) return null
  const frac = Math.max(0, Math.min(1, cursor - i0))
  return t0 + (t1 - t0) * frac
}

/**
 * Linearly interpolate a derived track at an observation unix time.
 * Pure geometry — not a forecast or analysed motion product.
 */
export function interpolateTrackAtUnix(track: StormTrack, unixSec: number): TrackPose | null {
  const pts = track.points
  if (!pts.length) return null

  const times = pts.map((p) => pointUnix(p.time))
  if (!Number.isFinite(times[0])) return null

  if (unixSec <= times[0]) {
    return {
      longitude: pts[0].longitude,
      latitude: pts[0].latitude,
      progress: 0,
      speedKmh: pts[0].speedKmh,
      bearingDeg: pts[0].bearingDeg,
      time: pts[0].time,
      clamped: unixSec < times[0],
    }
  }

  const last = pts.length - 1
  if (unixSec >= times[last]) {
    return {
      longitude: pts[last].longitude,
      latitude: pts[last].latitude,
      progress: 1,
      speedKmh: pts[last].speedKmh,
      bearingDeg: pts[last].bearingDeg,
      time: pts[last].time,
      clamped: unixSec > times[last],
    }
  }

  let i = 0
  while (i < last - 1 && times[i + 1] < unixSec) i += 1
  const t0 = times[i]
  const t1 = times[i + 1]
  const span = Math.max(1e-3, t1 - t0)
  const u = (unixSec - t0) / span
  const a = pts[i]
  const b = pts[i + 1]
  const segProgress = (i + u) / last

  return {
    longitude: a.longitude + (b.longitude - a.longitude) * u,
    latitude: a.latitude + (b.latitude - a.latitude) * u,
    progress: segProgress,
    speedKmh: b.speedKmh ?? a.speedKmh,
    bearingDeg: b.bearingDeg ?? a.bearingDeg,
    time: new Date(unixSec * 1000).toISOString(),
    clamped: false,
  }
}

/**
 * Convenience: pose for a track at the current radar timeline cursor.
 */
export function interpolateTrackAtCursor(
  track: StormTrack,
  frames: RadarObservation[],
  cursor: number,
): TrackPose | null {
  const unix = radarCursorToUnix(frames, cursor)
  if (unix == null) {
    // Fallback: map cursor progress across track points by index
    if (track.points.length === 0) return null
    const max = Math.max(1, frames.length - 1)
    const u = Math.max(0, Math.min(1, cursor / max))
    const f = u * (track.points.length - 1)
    const i0 = Math.floor(f)
    const i1 = Math.min(track.points.length - 1, i0 + 1)
    const frac = f - i0
    const a = track.points[i0]
    const b = track.points[i1]
    return {
      longitude: a.longitude + (b.longitude - a.longitude) * frac,
      latitude: a.latitude + (b.latitude - a.latitude) * frac,
      progress: u,
      speedKmh: b.speedKmh ?? a.speedKmh,
      bearingDeg: b.bearingDeg ?? a.bearingDeg,
      time: a.time,
      clamped: false,
    }
  }
  return interpolateTrackAtUnix(track, unix)
}
