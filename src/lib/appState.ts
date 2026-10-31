import type { CloudParams } from '../rendering/clouds/CloudVolume'
import type { LightingMode } from '../rendering/atmosphere/lighting'
import type { StormCameraPreset } from '../rendering/storm/StormControls'
import { CLOUD_DEFAULTS, TIMELINE } from '../config/app'

export type ViewMode = 'globe' | 'storm'

export interface LayerState {
  clouds: boolean
  lightning: boolean
  precipitation: boolean
}

export interface TimelineState {
  playing: boolean
  /** Seconds into the prototype simulation window. */
  simTime: number
  speed: number
  duration: number
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
    },
    cloudParams: { ...CLOUD_DEFAULTS },
    flashFreq: 0.35,
    timeline: {
      playing: true,
      simTime: 0,
      speed: TIMELINE.defaultSpeed,
      duration: TIMELINE.durationSec,
    },
    panelOpen: true,
    debugOpen: false,
    reducedFlash: reducedMotion,
    cameraPreset: 'overview',
    statusMessage: 'Explore the globe, then open the prototype storm.',
  }
}
