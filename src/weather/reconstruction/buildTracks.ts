import type { StormTrack } from '../types/observations'
import type { RadarCellCandidate } from './detectCells'

const MAX_LINK_KM = 180
const MAX_LINK_MINUTES = 45

/**
 * Associate per-frame cell candidates into short tracks with nearest-neighbour linking.
 * Confidence is intentionally low — this is a heuristic derived estimate.
 */
export function buildStormTracksFromCells(
  frames: RadarCellCandidate[][],
  sourceId: string,
): StormTrack[] {
  if (frames.length === 0) return []

  type Node = RadarCellCandidate & { used?: boolean }
  const layers: Node[][] = frames.map((f) => f.map((c) => ({ ...c })))
  const tracks: StormTrack[] = []
  let trackSeq = 0

  for (let fi = 0; fi < layers.length; fi++) {
    for (const seed of layers[fi]) {
      if (seed.used) continue
      seed.used = true
      const points = [
        {
          time: seed.observedAt,
          longitude: seed.longitude,
          latitude: seed.latitude,
          speedKmh: undefined as number | undefined,
          bearingDeg: undefined as number | undefined,
        },
      ]
      let current = seed

      for (let fj = fi + 1; fj < layers.length; fj++) {
        const dtMin = (layers[fj][0]?.frameTimeUnix - current.frameTimeUnix) / 60
        if (!Number.isFinite(dtMin) || dtMin > MAX_LINK_MINUTES) break

        let best: Node | null = null
        let bestDist = Infinity
        for (const cand of layers[fj]) {
          if (cand.used) continue
          const d = haversineKm(current.latitude, current.longitude, cand.latitude, cand.longitude)
          if (d < bestDist && d <= MAX_LINK_KM) {
            bestDist = d
            best = cand
          }
        }
        if (!best) break
        best.used = true
        const hours = Math.max(1 / 60, (best.frameTimeUnix - current.frameTimeUnix) / 3600)
        const speed = bestDist / hours
        const bearing = bearingDeg(current.latitude, current.longitude, best.latitude, best.longitude)
        points.push({
          time: best.observedAt,
          longitude: best.longitude,
          latitude: best.latitude,
          speedKmh: speed,
          bearingDeg: bearing,
        })
        current = best
      }

      if (points.length < 2) continue
      trackSeq += 1
      const stormId = `derived-cell-${trackSeq}`
      const meanIntensity =
        layers.flat().filter((c) => c.id.startsWith('cell-') && points.some((p) => p.time === c.observedAt)).length > 0
          ? seed.intensity
          : seed.intensity

      tracks.push({
        id: `track-${stormId}`,
        productType: 'storm_track',
        sourceId,
        stormId,
        observedAt: points[0].time,
        available: true,
        points,
        confidence: clamp01(0.25 + meanIntensity * 0.35 + Math.min(points.length, 6) * 0.05),
        provenance: {
          kind: 'derived',
          summary:
            'Heuristic cell track derived from RainViewer mosaic colour samples over Australia. Low confidence — not an official storm-cell product.',
          sourceId,
          observedAt: points[points.length - 1].time,
          qualityNote: `Linked ${points.length} frames; max link ${MAX_LINK_KM} km / ${MAX_LINK_MINUTES} min.`,
        },
      })
    }
  }

  tracks.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  return tracks.slice(0, 8)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
