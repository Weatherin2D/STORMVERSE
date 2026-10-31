import type { CloudParams } from '../rendering/clouds/CloudVolume'
import type { LightingMode } from '../rendering/atmosphere/lighting'
import type { StormCameraPreset } from '../rendering/storm/StormControls'
import { CLOUD_DEFAULTS, TIMELINE } from '../config/app'

export type ViewMode = 'globe' | 'storm'

export interface LayerState {
  clouds: boolean
  lightning: boolean
  precipitation: boolean
  /** Globe radar reflectivity mosaic. */
  radar: boolean
  /** Globe infrared satellite mosaic when available. */
  satellite: boolean
  /** Derived storm-cell tracks from radar mosaics. */
  tracks: boolean
}

export interface TimelineState {
  playing: boolean
  /**
   * Globe mode: index into radar/satellite frame list (fractional while playing).
   * Storm mode: seconds into the prototype simulation window.
   */
  cursor: number
  speed: number
  /** Globe: frame count - 1; Storm: duration seconds. */
  max: number
}

export interface AppState {
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: LayerState
  cloudParams: CloudParams
  flashFreq: number
  timeline: TimelineState
  panelOpen: boolean
  debugOpen: boolean
  reducedFlash: boolean
  cameraPreset: StormCameraPreset
  statusMessage: string
}

export function createInitialAppState(reducedMotion: boolean): AppState {
  return {
    viewMode: 'globe',
    lightingMode: 'day',
    layers: {
      clouds: true,
      lightning: true,
      precipitation: true,
      radar: true,
      satellite: false,
      tracks: true,
    },
    cloudParams: { ...CLOUD_DEFAULTS },
    flashFreq: 0.35,
    timeline: {
      playing: true,
      cursor: 0,
      speed: TIMELINE.defaultSpeed,
      max: TIMELINE.durationSec,
    },
    panelOpen: true,
    debugOpen: false,
    reducedFlash: reducedMotion,
    cameraPreset: 'overview',
    statusMessage: 'Loading Australian radar observations…',
  }
}
