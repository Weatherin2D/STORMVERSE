export const APP_NAME = 'STORMVERSE'
export const APP_TAGLINE = 'Thunderstorm exploration platform'

/** Default exploration focus — Australia-first (not a synthetic storm). */
export const DEFAULT_FOCUS = {
  longitude: 134.0,
  latitude: -26.0,
  /** Fallback site for Open-Meteo env when no track/case focus is selected. */
  envLongitude: 149.12,
  envLatitude: -32.45,
} as const

export const TIMELINE = {
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
