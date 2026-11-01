import type { LightingMode } from './lightingMode'
import { TIMELINE } from '../config/app'

export type ViewMode = 'globe' | 'immersive'

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
  /** Configured lightning GeoJSON events on the globe. */
  lightningObs: boolean
  /** Georegistered procedural storm volume on the globe. */
  volume: boolean
}

export interface TimelineState {
  playing: boolean
  /** Index into radar/satellite frame list (fractional while playing). */
  cursor: number
  speed: number
  /** Frame count - 1. */
  max: number
}

export interface AppState {
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: LayerState
  timeline: TimelineState
  panelOpen: boolean
  debugOpen: boolean
  reducedFlash: boolean
  statusMessage: string
}

export function createInitialAppState(reducedMotion: boolean): AppState {
  return {
    viewMode: 'globe',
    lightingMode: 'followSun',
    layers: {
      clouds: true,
      lightning: true,
      precipitation: true,
      radar: true,
      satellite: false,
      tracks: true,
      lightningObs: true,
      volume: true,
    },
    timeline: {
      playing: true,
      cursor: 0,
      speed: TIMELINE.defaultSpeed,
      max: 0,
    },
    panelOpen: true,
    debugOpen: false,
    reducedFlash: reducedMotion,
    statusMessage: 'Loading Australian radar observations…',
  }
}
