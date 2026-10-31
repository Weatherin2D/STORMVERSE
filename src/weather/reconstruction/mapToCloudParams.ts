import { CLOUD_DEFAULTS } from '../../config/app'
import type { CloudParams } from '../../rendering/clouds/CloudVolume'
import type { StormTrack } from '../types/observations'
import type { EnvironmentalProfile } from '../adapters/OpenMeteoAdapter'
import type { Provenance } from '../types/provenance'
import type { TrackPose } from './interpolateTrack'

export interface ReconstructionTarget {
  longitude: number
  latitude: number
  label: string
  cloudParams: CloudParams
  flashFreq: number
  provenance: Provenance
  drivers: {
    capeJkg?: number
    cellConfidence?: number
    trackPoints?: number
    alongTrackProgress?: number
    speedKmh?: number
    animated?: boolean
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * Map model CAPE + derived cell confidence into cloud shader parameters.
 * Output is a **procedural reconstruction**, not an observation.
 */
export function mapEnvironmentToReconstruction(
  environment: EnvironmentalProfile | null,
  track: StormTrack | null,
  pose?: TrackPose | null,
): ReconstructionTarget {
  const head = track?.points[track.points.length - 1]
  const cape = environment?.capeJkg ?? 400
  const conf = track?.confidence ?? 0.35
  const capeNorm = clamp01(cape / 2500)
  const intensity = clamp01(0.35 * conf + 0.65 * capeNorm)

  const cloudParams: CloudParams = {
    ...CLOUD_DEFAULTS,
    density: clamp01(0.55 + intensity * 0.4),
    verticalDevelopment: clamp01(0.45 + capeNorm * 0.5 + conf * 0.1),
    anvilExtent: clamp01(0.4 + intensity * 0.45),
    turbulence: clamp01(0.28 + intensity * 0.4),
    fineDetail: clamp01(0.45 + conf * 0.35),
    cloudTopStructure: clamp01(0.4 + capeNorm * 0.45),
    lightingResponse: clamp01(0.55 + intensity * 0.3),
    edgeSoftness: clamp01(0.4 + (1 - intensity) * 0.25),
    horizontalScale: 0.9 + intensity * 0.25,
    seed: track ? hashId(track.id) : CLOUD_DEFAULTS.seed,
  }

  const lon = pose?.longitude ?? head?.longitude ?? 149.12
  const lat = pose?.latitude ?? head?.latitude ?? -32.45
  const animated = Boolean(pose)

  return {
    longitude: lon,
    latitude: lat,
    label: track ? `${track.stormId} reconstruction` : 'Prototype reconstruction',
    cloudParams,
    flashFreq: clamp01(0.2 + intensity * 0.55),
    drivers: {
      capeJkg: environment?.capeJkg,
      cellConfidence: track?.confidence,
      trackPoints: track?.points.length,
      alongTrackProgress: pose?.progress,
      speedKmh: pose?.speedKmh,
      animated,
    },
    provenance: {
      kind: 'procedural',
      summary: track
        ? animated
          ? `Procedural volume animated along derived cell ${track.stormId} at observation time (conf ${Math.round(conf * 100)}%). Position follows the track; shape from CAPE — not a measured cloud volume.`
          : `Procedural 3D reconstruction informed by derived cell ${track.stormId} (conf ${Math.round(conf * 100)}%) and Open-Meteo CAPE. Not a measured cloud volume.`
        : 'Procedural 3D reconstruction informed by Open-Meteo CAPE only. Not a measured cloud volume.',
      sourceId: animated ? 'reconstruction-track-animation' : 'reconstruction-bridge',
      qualityNote: 'Parameter mapping and track interpolation are heuristic for visualisation — not a scientific retrieval.',
    },
  }
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 9000) + 100
}
