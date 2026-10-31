import * as THREE from 'three'

export type LightingMode = 'day' | 'sunset' | 'night'

export interface AtmosphereState {
  mode: LightingMode
  /** 0 = night, 0.5 = sunset, 1 = noon-like day. */
  sunElevation: number
  sunDirection: THREE.Vector3
  skyColor: THREE.Color
  fogColor: THREE.Color
  ambientIntensity: number
  hemiIntensity: number
  dirIntensity: number
  cloudLightColor: THREE.Color
  cloudCoreColor: THREE.Color
  cloudHighlightColor: THREE.Color
  exposure: number
}

const DAY: AtmosphereState = {
  mode: 'day',
  sunElevation: 0.72,
  sunDirection: new THREE.Vector3(0.35, 0.88, 0.22).normalize(),
  skyColor: new THREE.Color(0x7ea0c4),
  fogColor: new THREE.Color(0x8eabc4),
  ambientIntensity: 0.5,
  hemiIntensity: 0.62,
  dirIntensity: 1.25,
  cloudLightColor: new THREE.Color(0xfff8ea),
  cloudCoreColor: new THREE.Color(0x5a6578),
  cloudHighlightColor: new THREE.Color(0xffffff),
  exposure: 1.12,
}

const SUNSET: AtmosphereState = {
  mode: 'sunset',
  sunElevation: 0.12,
  sunDirection: new THREE.Vector3(0.92, 0.18, 0.12).normalize(),
  skyColor: new THREE.Color(0x2a1c2e),
  fogColor: new THREE.Color(0x3a2436),
  ambientIntensity: 0.18,
  hemiIntensity: 0.28,
  dirIntensity: 0.85,
  cloudLightColor: new THREE.Color(0xff9a5c),
  cloudCoreColor: new THREE.Color(0x1a1520),
  cloudHighlightColor: new THREE.Color(0xffc89a),
  exposure: 0.95,
}

const NIGHT: AtmosphereState = {
  mode: 'night',
  sunElevation: -0.35,
  sunDirection: new THREE.Vector3(-0.2, 0.35, -0.4).normalize(),
  skyColor: new THREE.Color(0x03050a),
  fogColor: new THREE.Color(0x04060c),
  ambientIntensity: 0.035,
  hemiIntensity: 0.06,
  dirIntensity: 0.08,
  cloudLightColor: new THREE.Color(0x6a7a9a),
  cloudCoreColor: new THREE.Color(0x05070e),
  cloudHighlightColor: new THREE.Color(0x1a2238),
  exposure: 0.72,
}

export function atmosphereFor(mode: LightingMode): AtmosphereState {
  switch (mode) {
    case 'sunset':
      return cloneAtmosphere(SUNSET)
    case 'night':
      return cloneAtmosphere(NIGHT)
    default:
      return cloneAtmosphere(DAY)
  }
}

function cloneAtmosphere(a: AtmosphereState): AtmosphereState {
  return {
    ...a,
    sunDirection: a.sunDirection.clone(),
    skyColor: a.skyColor.clone(),
    fogColor: a.fogColor.clone(),
    cloudLightColor: a.cloudLightColor.clone(),
    cloudCoreColor: a.cloudCoreColor.clone(),
    cloudHighlightColor: a.cloudHighlightColor.clone(),
  }
}
