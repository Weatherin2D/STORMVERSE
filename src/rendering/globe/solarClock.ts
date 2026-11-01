import { JulianDate, Math as CesiumMath, type Viewer } from 'cesium'
import type { LightingMode } from '../../lib/lightingMode'

/**
 * Drive Cesium clock / globe lighting from observation UTC or preview solar phases.
 */
export function applySolarClock(
  viewer: Viewer,
  opts: {
    mode: LightingMode
    observedAt: string | null
    focusLon: number
    focusLat: number
  },
): void {
  viewer.scene.globe.enableLighting = true
  viewer.scene.globe.dynamicAtmosphereLighting = true
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true
  }
  viewer.clock.shouldAnimate = false

  let iso = opts.observedAt
  if (opts.mode !== 'followSun') {
    iso = previewIsoForMode(opts.mode, opts.focusLon, opts.focusLat, opts.observedAt)
  }
  if (!iso) {
    iso = new Date().toISOString()
  }

  try {
    viewer.clock.currentTime = JulianDate.fromIso8601(iso)
  } catch {
    viewer.clock.currentTime = JulianDate.now()
  }
  viewer.scene.requestRender()
}

function previewIsoForMode(
  mode: Exclude<LightingMode, 'followSun'>,
  lon: number,
  _lat: number,
  observedAt: string | null,
): string {
  // Approximate local solar phase by shifting UTC so the focus longitude sees the desired sun elevation band.
  const day = observedAt ? new Date(observedAt) : new Date()
  const y = day.getUTCFullYear()
  const m = day.getUTCMonth()
  const d = day.getUTCDate()
  // Solar noon near lon: UTC hour ≈ 12 - lon/15
  const noonUtc = 12 - lon / 15
  const hour =
    mode === 'day'
      ? noonUtc
      : mode === 'sunrise'
        ? noonUtc - 5.5
        : mode === 'sunset'
          ? noonUtc + 5.5
          : noonUtc + 10
  const wrapped = ((hour % 24) + 24) % 24
  const h = Math.floor(wrapped)
  const min = Math.round((wrapped - h) * 60)
  return new Date(Date.UTC(y, m, d, h, min, 0)).toISOString()
}

export function sunPitchHint(mode: LightingMode): number {
  switch (mode) {
    case 'night':
      return CesiumMath.toRadians(-88)
    case 'sunrise':
    case 'sunset':
      return CesiumMath.toRadians(-28)
    case 'day':
      return CesiumMath.toRadians(-55)
    default:
      return CesiumMath.toRadians(-35)
  }
}
