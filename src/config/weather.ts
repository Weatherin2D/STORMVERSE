/** Australia-focused geographic defaults for Milestone 2. */
export const AUS_COVERAGE = {
  west: 110,
  south: -45,
  east: 155,
  north: -10,
} as const

export const RAINVIEWER = {
  catalogUrl: 'https://api.rainviewer.com/public/weather-maps.json',
  /** Refresh catalog every 3 minutes. */
  refreshMs: 180_000,
  attribution: 'Radar © RainViewer (public API)',
}

export const OPEN_METEO = {
  forecastUrl: 'https://api.open-meteo.com/v1/forecast',
  attribution: 'Environmental context © Open-Meteo (model forecast)',
}

/**
 * Optional licensed lightning FeatureCollection URL.
 * Example properties: observedAt, classification, peakCurrentKa, qualityScore,
 * network, polarity, multiplicity, locationErrorKm, source.
 */
export const LIGHTNING_FEED = {
  envKey: 'VITE_LIGHTNING_GEOJSON_URL',
  samplePath: '/samples/lightning.example.geojson',
}

/**
 * Optional licensed (or sample) truth-cell FeatureCollection for verification hooks.
 * Point features with observedAt / stormId / source. See public/samples/truth-cells.example.geojson.
 */
export const TRUTH_CELLS_FEED = {
  envKey: 'VITE_TRUTH_CELLS_GEOJSON_URL',
  samplePath: '/samples/truth-cells.example.geojson',
  /** Spatial / temporal association gates used by track–truth matching. */
  maxDistanceKm: 50,
  maxTimeDeltaSec: 90 * 60,
}

/**
 * Bundled multi-sensor case-study pack (lightning + truth + reference tracks).
 * Example only — not a licensed archive. See public/samples/case-study-nsw.example.json.
 */
export const CASE_STUDY_FEED = {
  envKey: 'VITE_CASE_STUDY_URL',
  samplePath: '/samples/case-study-nsw.example.json',
}
