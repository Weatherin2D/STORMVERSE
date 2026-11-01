import type { LayerState, TimelineState, ViewMode } from './appState'
import type { LightingMode } from './lightingMode'

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
    /** Prefer matching this observation time when restoring. */
    observedAt?: string
    /** Fallback fractional cursor 0…1 across available frames. */
    cursorNorm: number
    speed: number
  }
  exploration: {
    selectedStormId: string | null
    compareStormIds: string[]
    pinnedVolumeMode: 'cell' | null
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
  pinnedVolumeMode: 'cell' | null
  followTrack: boolean
  chaseVolume: boolean
  observedAt?: string | null
  camera?: SceneSnapshot['camera']
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function normalizeViewMode(raw: unknown): ViewMode {
  if (raw === 'immersive' || raw === 'storm') return 'immersive'
  return 'globe'
}

function normalizeLighting(raw: unknown): LightingMode {
  if (
    raw === 'followSun' ||
    raw === 'day' ||
    raw === 'sunrise' ||
    raw === 'sunset' ||
    raw === 'night'
  ) {
    return raw
  }
  return 'followSun'
}

function normalizePinned(raw: unknown): 'cell' | null {
  return raw === 'cell' ? 'cell' : null
}

export function buildSceneSnapshot(source: SceneSnapshotSource): SceneSnapshot {
  const max = Math.max(1e-6, source.timeline.max)
  return {
    version: SCENE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'stormverse',
    viewMode: source.viewMode === 'immersive' ? 'immersive' : 'globe',
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
      pinnedVolumeMode: source.pinnedVolumeMode === 'cell' ? 'cell' : null,
      followTrack: source.followTrack,
      chaseVolume: source.chaseVolume,
      panelOpen: source.panelOpen,
      reducedFlash: source.reducedFlash,
    },
    camera: source.camera,
    note:
      'STORMVERSE scene snapshot. Live radar/tracks/cloud field are re-fetched on restore; cell ids match by stormId when present.',
  }
}

export function parseSceneSnapshot(raw: unknown): SceneSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.app !== 'stormverse') return null
  if (o.version !== 1) return null
  if (o.viewMode !== 'globe' && o.viewMode !== 'storm' && o.viewMode !== 'immersive') return null
  const exploration = o.exploration
  if (!exploration || typeof exploration !== 'object') return null
  const timeline = o.timeline
  if (!timeline || typeof timeline !== 'object') return null
  const exp = exploration as Record<string, unknown>
  return {
    ...(o as unknown as SceneSnapshot),
    viewMode: normalizeViewMode(o.viewMode),
    lightingMode: normalizeLighting(o.lightingMode),
    exploration: {
      ...(exp as SceneSnapshot['exploration']),
      pinnedVolumeMode: normalizePinned(exp.pinnedVolumeMode),
    },
  }
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

export function encodeSceneHash(snapshot: SceneSnapshot): string {
  const json = JSON.stringify(snapshot)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return `#${SCENE_HASH_PREFIX}${b64}`
}

export function decodeSceneHash(hash: string): SceneSnapshot | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.startsWith(SCENE_HASH_PREFIX)) return null
  try {
    const b64 = raw.slice(SCENE_HASH_PREFIX.length)
    const json = decodeURIComponent(escape(atob(b64)))
    return parseSceneSnapshot(JSON.parse(json))
  } catch {
    return null
  }
}

export function buildShareUrl(snapshot: SceneSnapshot): string {
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
  void opts.stormDurationSec
  const max = Math.max(0, opts.frameCount - 1)
  if (snapshot.timeline.observedAt && opts.observedAts.length > 0) {
    const idx = opts.observedAts.findIndex((t) => t === snapshot.timeline.observedAt)
    if (idx >= 0) return idx
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
