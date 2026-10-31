import type { LayerState, TimelineState, ViewMode } from './appState'
import type { LightingMode } from '../rendering/atmosphere/lighting'

export const SCENE_SNAPSHOT_VERSION = 1 as const
export const SCENE_HASH_PREFIX = 'scene='

export interface SceneSnapshot {
  version: typeof SCENE_SNAPSHOT_VERSION
  exportedAt: string
  app: 'stormverse'
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: Partial<LayerState>
  timeline: {
    playing: boolean
    /** Prefer matching this observation time when restoring globe mode. */
    observedAt?: string
    /** Fallback fractional cursor 0…1 across available frames / sim window. */
    cursorNorm: number
    speed: number
  }
  exploration: {
    selectedStormId: string | null
    compareStormIds: string[]
    pinnedVolumeMode: 'prototype' | 'cell' | null
    followTrack: boolean
    chaseVolume: boolean
    panelOpen: boolean
    reducedFlash: boolean
  }
  camera?: {
    lon: number
    lat: number
    height: number
    oblique?: boolean
  }
  note: string
}

export interface SceneSnapshotSource {
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: LayerState
  timeline: TimelineState
  reducedFlash: boolean
  panelOpen: boolean
  selectedStormId: string | null
  compareStormIds: string[]
  pinnedVolumeMode: 'prototype' | 'cell' | null
  followTrack: boolean
  chaseVolume: boolean
  observedAt?: string | null
  camera?: SceneSnapshot['camera']
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function buildSceneSnapshot(source: SceneSnapshotSource): SceneSnapshot {
  const max = Math.max(1e-6, source.timeline.max)
  return {
    version: SCENE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'stormverse',
    viewMode: source.viewMode === 'storm' ? 'storm' : 'globe',
    lightingMode: source.lightingMode,
    layers: { ...source.layers },
    timeline: {
      playing: source.timeline.playing,
      observedAt: source.observedAt ?? undefined,
      cursorNorm: clamp01(source.timeline.cursor / max),
      speed: source.timeline.speed,
    },
    exploration: {
      selectedStormId: source.selectedStormId,
      compareStormIds: source.compareStormIds.slice(0, 8),
      pinnedVolumeMode: source.pinnedVolumeMode,
      followTrack: source.followTrack,
      chaseVolume: source.chaseVolume,
      panelOpen: source.panelOpen,
      reducedFlash: source.reducedFlash,
    },
    camera: source.camera,
    note:
      'STORMVERSE scene snapshot. Live radar/tracks are re-fetched on restore; cell ids match by stormId when present.',
  }
}

export function parseSceneSnapshot(raw: unknown): SceneSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.app !== 'stormverse') return null
  if (o.version !== 1) return null
  if (o.viewMode !== 'globe' && o.viewMode !== 'storm') return null
  const exploration = o.exploration
  if (!exploration || typeof exploration !== 'object') return null
  const timeline = o.timeline
  if (!timeline || typeof timeline !== 'object') return null
  return o as unknown as SceneSnapshot
}

export function snapshotToJson(snapshot: SceneSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function snapshotFromJson(text: string): SceneSnapshot | null {
  try {
    return parseSceneSnapshot(JSON.parse(text))
  } catch {
    return null
  }
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const bin = atob(padded + pad)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function encodeSceneHash(snapshot: SceneSnapshot): string {
  const compact = JSON.stringify(snapshot)
  return `#${SCENE_HASH_PREFIX}${toBase64Url(compact)}`
}

export function decodeSceneHash(hash: string): SceneSnapshot | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.startsWith(SCENE_HASH_PREFIX)) return null
  const encoded = raw.slice(SCENE_HASH_PREFIX.length)
  const json = fromBase64Url(encoded)
  if (!json) return null
  return snapshotFromJson(json)
}

export function buildShareUrl(snapshot: SceneSnapshot, location = window.location): string {
  const url = new URL(location.href)
  url.hash = encodeSceneHash(snapshot).slice(1)
  return url.toString()
}

export function downloadSceneSnapshot(snapshot: SceneSnapshot, filename?: string): void {
  const stamp = snapshot.exportedAt.replace(/[:.]/g, '-').slice(0, 19)
  const name = filename ?? `stormverse-scene-${stamp}.json`
  const blob = new Blob([snapshotToJson(snapshot)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function resolveTimelineCursor(
  snapshot: SceneSnapshot,
  opts: { frameCount: number; observedAts: string[]; stormDurationSec: number },
): number {
  if (snapshot.viewMode === 'storm') {
    return clamp01(snapshot.timeline.cursorNorm) * Math.max(1, opts.stormDurationSec)
  }
  const max = Math.max(0, opts.frameCount - 1)
  if (snapshot.timeline.observedAt && opts.observedAts.length > 0) {
    const idx = opts.observedAts.findIndex((t) => t === snapshot.timeline.observedAt)
    if (idx >= 0) return idx
    // nearest by time
    const target = Date.parse(snapshot.timeline.observedAt)
    if (Number.isFinite(target)) {
      let best = 0
      let bestDist = Infinity
      opts.observedAts.forEach((t, i) => {
        const d = Math.abs(Date.parse(t) - target)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      return best
    }
  }
  return clamp01(snapshot.timeline.cursorNorm) * max
}
