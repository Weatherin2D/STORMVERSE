import type { LightningObservation, StormTrack } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { EnvironmentalProfile } from '../adapters/OpenMeteoAdapter'
import { haversineKm } from './trackTruth'

export interface SchematicRhiColumn {
  /** Along-track range from the first point (km). */
  rangeKm: number
  /** Fraction along the track 0…1. */
  progress: number
  /** Schematic echo-top height (km). */
  topKm: number
  /** Schematic echo-base height (km). */
  baseKm: number
  /** 0–1 schematic intensity (not measured dBZ). */
  intensity: number
  latitude: number
  longitude: number
  time: string
}

export interface SchematicRhiLightningMark {
  rangeKm: number
  heightKm: number
  id: string
  classification: LightningObservation['classification']
}

export interface SchematicRhiSlice {
  columns: SchematicRhiColumn[]
  lightningMarks: SchematicRhiLightningMark[]
  lengthKm: number
  maxHeightKm: number
  peakIntensity: number
  stormId: string
  provenance: Provenance
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function alongTrackRanges(track: StormTrack): { rangeKm: number; progress: number; idx: number }[] {
  const pts = track.points
  if (pts.length === 0) return []
  let acc = 0
  const ranges = pts.map((p, idx) => {
    if (idx > 0) {
      const prev = pts[idx - 1]
      acc += haversineKm(prev.longitude, prev.latitude, p.longitude, p.latitude)
    }
    return { rangeKm: acc, progress: 0, idx }
  })
  const total = Math.max(acc, 1e-6)
  return ranges.map((r) => ({ ...r, progress: r.rangeKm / total }))
}

/**
 * Build a schematic RHI (range–height) slice along a derived/case-study track.
 * Intensities and tops are reconstruction aids — never measured reflectivity.
 */
export function buildSchematicRhi(opts: {
  track: StormTrack
  environment?: EnvironmentalProfile | null
  lightning?: LightningObservation[]
  /** Half-width corridor for projecting lightning onto the track (km). */
  lightningCorridorKm?: number
}): SchematicRhiSlice | null {
  const { track, environment = null, lightning = [], lightningCorridorKm = 25 } = opts
  if (track.points.length < 2) return null

  const cape = environment?.capeJkg ?? 500
  const precip = environment?.precipitationMm ?? 0
  const conf = track.confidence ?? 0.4
  const capeNorm = clamp01(cape / 2500)
  const precipNorm = clamp01(precip / 8)
  // Confidence-led floor so sparse model CAPE still yields a readable schematic.
  const baseIntensity = clamp01(0.2 + 0.4 * conf + 0.3 * capeNorm + 0.2 * precipNorm)

  const ranges = alongTrackRanges(track)
  const lengthKm = ranges[ranges.length - 1]?.rangeKm ?? 0
  if (lengthKm < 0.5) return null

  const columns: SchematicRhiColumn[] = ranges.map((r) => {
    const pt = track.points[r.idx]
    // Mild along-track evolution: intensify mid-path, taper ends
    const midBoost = 1 - Math.abs(r.progress - 0.55) * 1.1
    const intensity = clamp01(baseIntensity * (0.55 + 0.55 * midBoost))
    const topKm = 4 + intensity * 10 + capeNorm * 2
    const baseKm = 0.4 + (1 - intensity) * 1.2
    return {
      rangeKm: r.rangeKm,
      progress: r.progress,
      topKm,
      baseKm,
      intensity,
      latitude: pt.latitude,
      longitude: pt.longitude,
      time: pt.time,
    }
  })

  const lightningMarks: SchematicRhiLightningMark[] = []
  for (const ev of lightning) {
    let best = { dist: Infinity, rangeKm: 0 }
    for (let i = 0; i < track.points.length; i++) {
      const p = track.points[i]
      const d = haversineKm(p.longitude, p.latitude, ev.longitude, ev.latitude)
      if (d < best.dist) best = { dist: d, rangeKm: ranges[i].rangeKm }
    }
    if (best.dist > lightningCorridorKm) continue
    lightningMarks.push({
      rangeKm: best.rangeKm,
      heightKm: Math.min(14, Math.max(2, (ev.altitudeM ?? 5000) / 1000)),
      id: ev.id,
      classification: ev.classification,
    })
  }

  const peakIntensity = columns.reduce((m, c) => Math.max(m, c.intensity), 0)
  const maxHeightKm = Math.max(12, ...columns.map((c) => c.topKm), ...lightningMarks.map((m) => m.heightKm))

  return {
    columns,
    lightningMarks,
    lengthKm,
    maxHeightKm,
    peakIntensity,
    stormId: track.stormId,
    provenance: {
      kind: 'procedural',
      summary:
        'Schematic RHI along the selected track. Tops/intensity are reconstruction aids from CAPE, precip hint, and cell confidence — not a measured radar volume or BoM RHI product.',
      sourceId: 'schematic-rhi',
      observedAt: track.observedAt,
      qualityNote: 'Do not interpret colour bands as calibrated dBZ.',
    },
  }
}
