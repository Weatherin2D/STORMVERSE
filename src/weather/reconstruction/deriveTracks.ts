import type { RadarObservation, StormTrack } from '../types/observations'
import { detectCellsFromRadarFrame } from './detectCells'
import { buildStormTracksFromCells } from './buildTracks'

/**
 * Derive storm tracks from the most recent radar mosaic frames.
 * Runs in the browser against RainViewer tiles (CORS-enabled).
 */
export async function deriveTracksFromRadarFrames(
  frames: RadarObservation[],
  sourceId: string,
  options: { frameLimit?: number; signal?: AbortSignal } = {},
): Promise<StormTrack[]> {
  const limit = options.frameLimit ?? 4
  const usable = frames.filter((f) => f.available && f.tileUrlTemplate).slice(-limit)
  if (usable.length === 0) return []

  const perFrame = []
  for (const frame of usable) {
    if (options.signal?.aborted) return []
    const cells = await detectCellsFromRadarFrame(frame, {
      zoom: 3,
      signal: options.signal,
    })
    perFrame.push(cells)
  }
  const tracks = buildStormTracksFromCells(perFrame, sourceId)
  // If linking failed but cells exist, expose single-point "tracks" as short markers
  // by duplicating the latest cell with a tiny offset so the UI can still list foci.
  if (tracks.length === 0) {
    const latest = perFrame[perFrame.length - 1] ?? []
    return latest.slice(0, 5).map((cell, i) => ({
      id: `track-focus-${cell.frameTimeUnix}-${i}`,
      productType: 'storm_track' as const,
      sourceId,
      stormId: `derived-focus-${i + 1}`,
      observedAt: cell.observedAt,
      available: true,
      points: [
        {
          time: cell.observedAt,
          longitude: cell.longitude,
          latitude: cell.latitude,
        },
        {
          // Minimal second point so globe polylines still render
          time: cell.observedAt,
          longitude: cell.longitude + 0.15,
          latitude: cell.latitude + 0.05,
        },
      ],
      confidence: clamp01(0.2 + cell.intensity * 0.4),
      provenance: {
        kind: 'derived' as const,
        summary:
          'Single-frame precip focus from RainViewer mosaic sampling (no multi-frame link). Low confidence.',
        sourceId,
        observedAt: cell.observedAt,
      },
    }))
  }
  return tracks
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
