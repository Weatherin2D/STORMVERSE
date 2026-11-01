/**
 * Lighting control for the Cesium globe.
 * `followSun` (default) uses observation UTC; others are labelled preview overrides.
 */
export type LightingMode = 'followSun' | 'day' | 'sunrise' | 'sunset' | 'night'
