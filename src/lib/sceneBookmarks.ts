import type { SceneSnapshot } from './sceneSnapshot'
import { parseSceneSnapshot } from './sceneSnapshot'

export const SCENE_BOOKMARKS_KEY = 'stormverse.sceneBookmarks.v1'
export const MAX_SCENE_BOOKMARKS = 24

export interface SceneBookmark {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  snapshot: SceneSnapshot
}

export interface SceneBookmarkListItem {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  viewMode: SceneSnapshot['viewMode']
  compareCount: number
  observedAt?: string
  pinnedVolumeMode: SceneSnapshot['exploration']['pinnedVolumeMode']
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function readAll(): SceneBookmark[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(SCENE_BOOKMARKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const o = item as Record<string, unknown>
        const snapshot = parseSceneSnapshot(o.snapshot)
        if (!snapshot) return null
        if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
        return {
          id: o.id,
          name: o.name.trim() || 'Untitled scene',
          createdAt: typeof o.createdAt === 'string' ? o.createdAt : snapshot.exportedAt,
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : snapshot.exportedAt,
          snapshot,
        } satisfies SceneBookmark
      })
      .filter((b): b is SceneBookmark => b != null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

function writeAll(bookmarks: SceneBookmark[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(SCENE_BOOKMARKS_KEY, JSON.stringify(bookmarks.slice(0, MAX_SCENE_BOOKMARKS)))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function listSceneBookmarks(): SceneBookmarkListItem[] {
  return readAll().map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    viewMode: b.snapshot.viewMode,
    compareCount: b.snapshot.exploration.compareStormIds.length,
    observedAt: b.snapshot.timeline.observedAt,
    pinnedVolumeMode: b.snapshot.exploration.pinnedVolumeMode,
  }))
}

export function getSceneBookmark(id: string): SceneBookmark | null {
  return readAll().find((b) => b.id === id) ?? null
}

export function saveSceneBookmark(name: string, snapshot: SceneSnapshot): SceneBookmark {
  const trimmed = name.trim() || defaultBookmarkName(snapshot)
  const now = new Date().toISOString()
  const bookmark: SceneBookmark = {
    id: newId(),
    name: trimmed.slice(0, 80),
    createdAt: now,
    updatedAt: now,
    snapshot: { ...snapshot, exportedAt: now },
  }
  const next = [bookmark, ...readAll().filter((b) => b.id !== bookmark.id)].slice(
    0,
    MAX_SCENE_BOOKMARKS,
  )
  writeAll(next)
  return bookmark
}

export function renameSceneBookmark(id: string, name: string): SceneBookmark | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const all = readAll()
  const idx = all.findIndex((b) => b.id === id)
  if (idx < 0) return null
  const updated: SceneBookmark = {
    ...all[idx],
    name: trimmed.slice(0, 80),
    updatedAt: new Date().toISOString(),
  }
  all[idx] = updated
  writeAll(all)
  return updated
}

export function deleteSceneBookmark(id: string): boolean {
  const all = readAll()
  const next = all.filter((b) => b.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

export function defaultBookmarkName(snapshot: SceneSnapshot): string {
  const compare = snapshot.exploration.compareStormIds.length
  if (compare > 1) return `Compare ${compare} cells`
  if (snapshot.exploration.pinnedVolumeMode === 'cell') {
    return snapshot.exploration.selectedStormId
      ? `Pinned ${snapshot.exploration.selectedStormId}`
      : 'Pinned cell volume'
  }
  if (snapshot.timeline.observedAt) {
    return `Radar ${snapshot.timeline.observedAt.replace('T', ' ').slice(0, 16)}Z`
  }
  return snapshot.viewMode === 'immersive' ? 'Immersive atmosphere' : 'Earth exploration'
}
