export const APP_NAME = 'STORMVERSE'
export const APP_TAGLINE = 'Thunderstorm exploration platform'

/** Prototype storm location — inland NSW / southern QLD corridor (Australia-first). */
export const PROTOTYPE_STORM = {
  id: 'proto-aus-supercell-01',
  name: 'Prototype Supercell A',
  label: 'Synthetic demonstration storm',
  longitude: 149.12,
  latitude: -32.45,
  provenance: 'synthetic' as const,
  description:
    'A representative cumulonimbus reconstruction for visual and architectural development. Not a live observation or reconstructed real storm.',
}

export const TIMELINE = {
  /** Prototype simulation window length in seconds of sim-time. */
  durationSec: 3600,
  defaultSpeed: 1,
  speeds: [0.25, 0.5, 1, 2, 4] as const,
}

export const CLOUD_DEFAULTS = {
  density: 0.78,
  verticalDevelopment: 0.85,
  horizontalScale: 1.0,
  anvilExtent: 0.72,
  edgeSoftness: 0.55,
  turbulence: 0.42,
  fineDetail: 0.65,
  cloudTopStructure: 0.6,
  lightingResponse: 0.7,
  seed: 42,
}
