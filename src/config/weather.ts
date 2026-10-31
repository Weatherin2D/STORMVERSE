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
