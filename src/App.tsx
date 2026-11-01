import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { GlobeView } from './components/globe/GlobeView'
import { ExplorationControls } from './components/controls/ExplorationControls'
import { InfoPanel } from './components/panels/InfoPanel'
import { TimelineBar } from './components/timeline/TimelineBar'
import { createInitialAppState, type LayerState } from './lib/appState'
import {
  buildSceneSnapshot,
  buildShareUrl,
  decodeSceneHash,
  downloadSceneSnapshot,
  encodeSceneHash,
  snapshotFromJson,
  type SceneSnapshot,
} from './lib/sceneSnapshot'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useLiveWeather } from './hooks/useLiveWeather'
import type { LightingMode } from './lib/lightingMode'
import {
  DEFAULT_CROSS_PRODUCT_TIME_WINDOW_SEC,
  DEFAULT_LIGHTNING_FILTER,
  buildCrossProductReport,
  downloadTruthCellsTemplate,
  filterLightningEvents,
  interpolateTrackAtCursor,
  lightningInObservationWindow,
  mapEnvironmentToReconstruction,
  summarizeLightningQuality,
  type LightningQualityFilter,
  type LightningSyncMode,
  type ReconstructionTarget,
} from './weather'
import { DEFAULT_FOCUS, TIMELINE } from './config/app'
import { accentForIndex, MAX_COMPARE_VOLUMES } from './config/compare'
import { SceneShareControls } from './components/controls/SceneShareControls'
import {
  defaultBookmarkName,
  deleteSceneBookmark,
  getSceneBookmark,
  listSceneBookmarks,
  renameSceneBookmark,
  saveSceneBookmark,
} from './lib/sceneBookmarks'

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [state, setState] = useState(() => createInitialAppState(reducedMotion))
  const live = useLiveWeather(state.layers.tracks)
  const [flyHomeToken, setFlyHomeToken] = useState(0)
  const [enterImmersiveToken, setEnterImmersiveToken] = useState(0)
  const [flyTarget, setFlyTarget] = useState<{
    lon: number
    lat: number
    height: number
    token: number
    oblique?: boolean
  } | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [pinnedVolumeMode, setPinnedVolumeMode] = useState<'cell' | null>(null)
  /** Track ids pinned for multi-cell volume comparison (selected is primary). */
  const [compareTrackIds, setCompareTrackIds] = useState<string[]>([])
  /** When true, pinned cell volumes follow derived tracks through observation time. */
  const [followTrack, setFollowTrack] = useState(true)
  const [chaseVolume, setChaseVolume] = useState(false)
  const [pendingSnapshot, setPendingSnapshot] = useState<SceneSnapshot | null>(() =>
    typeof window !== 'undefined' ? decodeSceneHash(window.location.hash) : null,
  )
  const snapshotAppliedRef = useRef(false)
  const [bookmarks, setBookmarks] = useState(() => listSceneBookmarks())
  const refreshBookmarks = useCallback(() => setBookmarks(listSceneBookmarks()), [])
  const [lightningFilter, setLightningFilter] = useState<LightningQualityFilter>(
    () => ({ ...DEFAULT_LIGHTNING_FILTER }),
  )
  const [lightningSyncMode, setLightningSyncMode] = useState<LightningSyncMode>('off')

  const qualityFilteredLightning = useMemo(
    () => filterLightningEvents(live.lightningEvents, lightningFilter),
    [live.lightningEvents, lightningFilter],
  )

  const radarObservedAt = useMemo(() => {
    if (live.radarFrames.length === 0) return null
    return live.radarFrames[live.radarFrames.length - 1]?.observedAt ?? null
  }, [live.radarFrames])

  const syncObservedAt =
    lightningSyncMode === 'case'
      ? live.caseStudy?.focusObservedAt ?? null
      : lightningSyncMode === 'radar'
        ? radarObservedAt
        : null

  const filteredLightningEvents = useMemo(() => {
    if (!syncObservedAt) return qualityFilteredLightning
    return lightningInObservationWindow(
      qualityFilteredLightning,
      syncObservedAt,
      DEFAULT_CROSS_PRODUCT_TIME_WINDOW_SEC,
    )
  }, [syncObservedAt, qualityFilteredLightning])

  const lightningQualitySummary = useMemo(
    () => summarizeLightningQuality(live.lightningEvents, qualityFilteredLightning),
    [live.lightningEvents, qualityFilteredLightning],
  )

  const crossProductReport = useMemo(
    () =>
      buildCrossProductReport({
        radarObservedAt: syncObservedAt ?? radarObservedAt,
        radarFrameCount: live.radarFrames.length,
        tracks: live.tracks,
        trackSkillSummary: live.trackSkillSummary,
        truthSummary: live.trackTruthSummary,
        lightningConfigured: live.lightningConfigured,
        lightningAll: live.lightningEvents,
        lightningVisible: filteredLightningEvents,
        lightningSummary: lightningQualitySummary,
        selectedTrackId,
      }),
    [
      syncObservedAt,
      radarObservedAt,
      live.radarFrames.length,
      live.tracks,
      live.trackSkillSummary,
      live.trackTruthSummary,
      live.lightningConfigured,
      live.lightningEvents,
      filteredLightningEvents,
      lightningQualitySummary,
      selectedTrackId,
    ],
  )

  useEffect(() => {
    if (live.caseStudy) {
      setLightningSyncMode((mode) => (mode === 'off' ? 'case' : mode))
      return
    }
    setLightningSyncMode((mode) => (mode === 'case' ? 'off' : mode))
  }, [live.caseStudy])

  useEffect(() => {
    if (!live.caseStudy) return
    setSelectedTrackId(live.caseStudy.tracks[0]?.id ?? null)
    setFlyTarget({
      lon: live.caseStudy.focus.longitude,
      lat: live.caseStudy.focus.latitude,
      height: 220_000,
      token: Date.now(),
      oblique: true,
    })
  }, [live.caseStudy?.id])

  useEffect(() => {
    setState((s) => ({ ...s, reducedFlash: reducedMotion || s.reducedFlash }))
  }, [reducedMotion])

  useEffect(() => {
    if (live.tracks.length === 0) {
      setSelectedTrackId(null)
      setCompareTrackIds([])
      return
    }
    setSelectedTrackId((prev) =>
      prev && live.tracks.some((t) => t.id === prev) ? prev : live.tracks[0].id,
    )
    setCompareTrackIds((prev) => prev.filter((id) => live.tracks.some((t) => t.id === id)))
  }, [live.tracks])

  const selectedTrack = useMemo(
    () => live.tracks.find((t) => t.id === selectedTrackId) ?? null,
    [live.tracks, selectedTrackId],
  )

  const previewReconstruction = useMemo(
    () => mapEnvironmentToReconstruction(live.environment, selectedTrack),
    [live.environment, selectedTrack],
  )

  const compareVolumes = useMemo((): ReconstructionTarget[] => {
    if (pinnedVolumeMode !== 'cell' || compareTrackIds.length === 0) return []
    const primaryId = selectedTrackId && compareTrackIds.includes(selectedTrackId)
      ? selectedTrackId
      : compareTrackIds[0]
    const out: ReconstructionTarget[] = []
    compareTrackIds.forEach((id, index) => {
      const track = live.tracks.find((t) => t.id === id)
      if (!track) return
      const pose =
        followTrack && live.radarFrames.length > 0
          ? interpolateTrackAtCursor(
              track,
              live.radarFrames,
              live.radarFrames.length - 1,
            )
          : null
      const base = mapEnvironmentToReconstruction(live.environment, track, pose)
      out.push({
        ...base,
        accentCss: accentForIndex(index),
        primary: id === primaryId,
      })
    })
    return out
  }, [
    pinnedVolumeMode,
    compareTrackIds,
    selectedTrackId,
    live.tracks,
    live.radarFrames,
    live.environment,
    followTrack,
  ])

  const globeVolumeTargets = useMemo(() => {
    if (pinnedVolumeMode === 'cell') return compareVolumes
    return [] as ReconstructionTarget[]
  }, [pinnedVolumeMode, compareVolumes])

  const globeVolumeTarget = globeVolumeTargets.find((t) => t.primary) ?? globeVolumeTargets[0] ?? null

  const lastChaseRef = useRef(0)
  useEffect(() => {
    if (!chaseVolume || !followTrack || pinnedVolumeMode !== 'cell') return
    if (!globeVolumeTarget) return
    const now = performance.now()
    if (now - lastChaseRef.current < 2200) return
    lastChaseRef.current = now
    setFlyTarget({
      lon: globeVolumeTarget.longitude,
      lat: globeVolumeTarget.latitude,
      height: 160_000,
      token: Date.now(),
      oblique: true,
    })
  }, [
    chaseVolume,
    followTrack,
    pinnedVolumeMode,
    globeVolumeTarget?.longitude,
    globeVolumeTarget?.latitude,
  ])

  useEffect(() => {
    if (live.radarFrames.length === 0) return
    setState((s) => {
      const max = Math.max(0, live.radarFrames.length - 1)
      const trackNote =
        s.layers.tracks && live.tracks.length > 0
          ? ` · ${live.tracks.length} derived track(s)`
          : live.tracksLoading
            ? ' · deriving tracks…'
            : ''
      const cloudNote = live.cloudFieldLoading
        ? ' · shaping clouds…'
        : live.cloudTiles.length > 0
          ? ` · ${live.cloudTiles.length} mosaic sheets · ${live.cloudField.length} fill`
          : live.cloudField.length > 0
            ? ` · ${live.cloudField.length} cloud pts`
            : ''
      const lghtNote =
        live.lightningConfigured && live.lightningEvents.length > 0
          ? filteredLightningEvents.length === live.lightningEvents.length
            ? ` · ${live.lightningEvents.length} lightning`
            : ` · ${filteredLightningEvents.length}/${live.lightningEvents.length} lightning`
          : ''
      return {
        ...s,
        timeline: {
          ...s.timeline,
          max,
          // Live recreation: always the latest mosaic, never a looping scrub.
          cursor: max,
          playing: false,
        },
        statusMessage: live.error
          ? `Radar feed error: ${live.error}`
          : `Live weather · current mosaic${trackNote}${cloudNote}${lghtNote}`,
      }
    })
  }, [
    live.radarFrames,
    live.error,
    live.tracks,
    live.tracksLoading,
    live.lightningConfigured,
    live.lightningEvents.length,
    live.cloudField.length,
    live.cloudTiles.length,
    live.cloudFieldLoading,
    filteredLightningEvents.length,
    state.layers.tracks,
  ])

  // Always the current (latest) observation — not a historical animation cursor.
  const radarFrame =
    live.radarFrames.length > 0 ? live.radarFrames[live.radarFrames.length - 1] : null
  const satelliteFrame =
    state.layers.satellite && live.satelliteFrames.length > 0
      ? live.satelliteFrames[live.satelliteFrames.length - 1]
      : null
  const immersiveFocus = useMemo(() => {
    if (selectedTrack) {
      const head = selectedTrack.points[selectedTrack.points.length - 1]
      return { lon: head.longitude, lat: head.latitude }
    }
    if (live.caseStudy) {
      return {
        lon: live.caseStudy.focus.longitude,
        lat: live.caseStudy.focus.latitude,
      }
    }
    return { lon: DEFAULT_FOCUS.envLongitude, lat: DEFAULT_FOCUS.envLatitude }
  }, [selectedTrack, live.caseStudy])

  const pinSelectedCell = useCallback(() => {
    if (!selectedTrack) return
    const pose = interpolateTrackAtCursor(
      selectedTrack,
      live.radarFrames,
      Math.max(0, live.radarFrames.length - 1),
    )
    const recon = mapEnvironmentToReconstruction(live.environment, selectedTrack, pose)
    setPinnedVolumeMode('cell')
    setFollowTrack(true)
    setCompareTrackIds((prev) => {
      if (prev.includes(selectedTrack.id)) return prev
      if (prev.length >= MAX_COMPARE_VOLUMES) {
        return [...prev.slice(1), selectedTrack.id]
      }
      return [...prev, selectedTrack.id]
    })
    setState((s) => ({
      ...s,
      layers: { ...s.layers, volume: true },
      statusMessage: `Pinned ${selectedTrack.stormId} · compare volumes · procedural`,
    }))
    setFlyTarget({
      lon: recon.longitude,
      lat: recon.latitude,
      height: 160_000,
      token: Date.now(),
      oblique: true,
    })
  }, [live.environment, live.radarFrames, selectedTrack])

  const addSelectedToCompare = useCallback(() => {
    if (!selectedTrack) return
    pinSelectedCell()
  }, [pinSelectedCell, selectedTrack])

  const compareTopTracks = useCallback(() => {
    const top = live.tracks.slice(0, MAX_COMPARE_VOLUMES)
    if (top.length === 0) return
    setCompareTrackIds(top.map((t) => t.id))
    setSelectedTrackId(top[0].id)
    setPinnedVolumeMode('cell')
    setFollowTrack(true)
    const pose = interpolateTrackAtCursor(
      top[0],
      live.radarFrames,
      Math.max(0, live.radarFrames.length - 1),
    )
    const recon = mapEnvironmentToReconstruction(live.environment, top[0], pose)
    setState((s) => ({
      ...s,
      layers: { ...s.layers, volume: true },
      statusMessage: `Comparing ${top.length} derived cells · procedural volumes`,
      panelOpen: true,
    }))
    setFlyTarget({
      lon: recon.longitude,
      lat: recon.latitude,
      height: 280_000,
      token: Date.now(),
      oblique: true,
    })
  }, [live.tracks, live.radarFrames, live.environment])

  const clearCompare = useCallback(() => {
    setCompareTrackIds([])
    setPinnedVolumeMode(null)
    setChaseVolume(false)
    setState((s) => ({
      ...s,
      statusMessage: 'Cleared compare volumes',
    }))
  }, [])

  const removeFromCompare = useCallback((trackId: string) => {
    setCompareTrackIds((prev) => {
      const next = prev.filter((id) => id !== trackId)
      if (next.length === 0) setPinnedVolumeMode(null)
      return next
    })
  }, [])

  const enterImmersive = useCallback(() => {
    setState((s) => ({
      ...s,
      viewMode: 'immersive',
      layers: { ...s.layers, clouds: true, precipitation: true },
      statusMessage:
        'Immersive atmosphere · model cloud-cover + RainViewer shafts · GeoJSON lightning only',
      panelOpen: true,
    }))
    setEnterImmersiveToken((n) => n + 1)
  }, [])

  const exitImmersive = useCallback(() => {
    const max = Math.max(0, live.radarFrames.length - 1)
    setState((s) => ({
      ...s,
      viewMode: 'globe',
      statusMessage:
        live.radarFrames.length > 0
          ? 'Live weather · current RainViewer mosaic'
          : 'Returned to exploration view',
      timeline: {
        playing: false,
        cursor: max,
        speed: TIMELINE.defaultSpeed,
        max,
      },
    }))
    setFlyHomeToken((n) => n + 1)
  }, [live.radarFrames.length])

  const setLayers = (partial: Partial<LayerState>) => {
    setState((s) => ({ ...s, layers: { ...s.layers, ...partial } }))
  }

  const captureSnapshot = useCallback((): SceneSnapshot => {
    const selectedStormId =
      live.tracks.find((t) => t.id === selectedTrackId)?.stormId ?? selectedTrackId
    const compareStormIds = compareTrackIds.map(
      (id) => live.tracks.find((t) => t.id === id)?.stormId ?? id,
    )
    const observedAt =
      live.radarFrames.length > 0
        ? live.radarFrames[live.radarFrames.length - 1]?.observedAt
        : null
    return buildSceneSnapshot({
      viewMode: state.viewMode,
      lightingMode: state.lightingMode,
      layers: state.layers,
      timeline: state.timeline,
      reducedFlash: state.reducedFlash,
      panelOpen: state.panelOpen,
      selectedStormId,
      compareStormIds,
      pinnedVolumeMode,
      followTrack,
      chaseVolume,
      observedAt,
      camera: flyTarget
        ? {
            lon: flyTarget.lon,
            lat: flyTarget.lat,
            height: flyTarget.height,
            oblique: flyTarget.oblique,
          }
        : {
            lon: immersiveFocus.lon,
            lat: immersiveFocus.lat,
            height: state.viewMode === 'immersive' ? 28_000 : 220_000,
            oblique: true,
          },
    })
  }, [
    live.tracks,
    live.radarFrames,
    selectedTrackId,
    compareTrackIds,
    state.viewMode,
    state.lightingMode,
    state.layers,
    state.timeline,
    state.reducedFlash,
    state.panelOpen,
    pinnedVolumeMode,
    followTrack,
    chaseVolume,
    flyTarget,
    immersiveFocus,
  ])

  const applySceneSnapshot = useCallback(
    (snap: SceneSnapshot) => {
      const stormToTrack = new Map(live.tracks.map((t) => [t.stormId, t.id]))
      const resolveId = (stormId: string | null | undefined) => {
        if (!stormId) return null
        return stormToTrack.get(stormId) ?? live.tracks.find((t) => t.id === stormId)?.id ?? null
      }

      const compareIds = snap.exploration.compareStormIds
        .map((id) => resolveId(id))
        .filter((id): id is string => Boolean(id))
        .slice(0, MAX_COMPARE_VOLUMES)

      const selected =
        resolveId(snap.exploration.selectedStormId) ??
        compareIds[0] ??
        live.tracks[0]?.id ??
        null

      const max = Math.max(0, live.radarFrames.length - 1)
      const pinnedMode =
        snap.exploration.pinnedVolumeMode === 'cell' ? ('cell' as const) : null

      setFollowTrack(snap.exploration.followTrack)
      setChaseVolume(snap.exploration.chaseVolume)
      setCompareTrackIds(compareIds)
      setSelectedTrackId(selected)
      setPinnedVolumeMode(pinnedMode)

      const viewMode: 'globe' | 'immersive' =
        snap.viewMode === 'immersive' ? 'immersive' : 'globe'

      setState((s) => ({
        ...s,
        viewMode,
        lightingMode:
          snap.lightingMode === 'day' ||
          snap.lightingMode === 'sunset' ||
          snap.lightingMode === 'night' ||
          snap.lightingMode === 'sunrise' ||
          snap.lightingMode === 'followSun'
            ? snap.lightingMode
            : 'followSun',
        layers: { ...s.layers, ...snap.layers },
        reducedFlash: snap.exploration.reducedFlash,
        panelOpen: snap.exploration.panelOpen,
        timeline: {
          // Snapshots restore layers/camera; weather stays on the live current frame.
          playing: false,
          speed: snap.timeline.speed,
          cursor: max,
          max,
        },
        statusMessage: `Restored scene snapshot · ${snap.exportedAt.replace('T', ' ').slice(0, 19)}Z`,
      }))

      if (viewMode === 'immersive') {
        setEnterImmersiveToken((n) => n + 1)
      }

      if (snap.camera) {
        setFlyTarget({
          lon: snap.camera.lon,
          lat: snap.camera.lat,
          height: snap.camera.height,
          oblique: snap.camera.oblique,
          token: Date.now(),
        })
      }

      try {
        const hash = encodeSceneHash(snap).slice(1)
        if (window.location.hash.slice(1) !== hash) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`)
        }
      } catch {
        /* ignore history errors */
      }
    },
    [live.tracks, live.radarFrames, live.environment],
  )

  useEffect(() => {
    if (!pendingSnapshot || snapshotAppliedRef.current) return
    if (live.loading) return
    if (live.radarFrames.length === 0) return
    const needsTracks =
      pendingSnapshot.exploration.compareStormIds.length > 0 ||
      pendingSnapshot.exploration.pinnedVolumeMode === 'cell'
    if (needsTracks && (live.tracksLoading || live.tracks.length === 0)) return
    snapshotAppliedRef.current = true
    applySceneSnapshot(pendingSnapshot)
    setPendingSnapshot(null)
  }, [
    pendingSnapshot,
    live.loading,
    live.radarFrames.length,
    live.tracksLoading,
    live.tracks.length,
    applySceneSnapshot,
  ])

  const exportSceneJson = useCallback(() => {
    downloadSceneSnapshot(captureSnapshot())
  }, [captureSnapshot])

  const copyShareLink = useCallback(async () => {
    const snap = captureSnapshot()
    const url = buildShareUrl(snap)
    try {
      window.history.replaceState(null, '', url)
    } catch {
      /* ignore */
    }
    try {
      await navigator.clipboard.writeText(url)
      setState((s) => ({ ...s, statusMessage: 'Share link copied · scene encoded in URL hash' }))
      return true
    } catch {
      setState((s) => ({
        ...s,
        statusMessage: 'Scene hash updated in URL · clipboard unavailable',
      }))
      return false
    }
  }, [captureSnapshot])

  const importSceneText = useCallback(
    (text: string) => {
      const snap = snapshotFromJson(text)
      if (!snap) {
        return { ok: false, message: 'Invalid STORMVERSE scene JSON' }
      }
      snapshotAppliedRef.current = false
      setPendingSnapshot(snap)
      return { ok: true, message: 'Scene import queued — applying when data is ready' }
    },
    [],
  )

  const saveBookmarkNamed = useCallback(
    (name: string) => {
      try {
        const snap = captureSnapshot()
        const saved = saveSceneBookmark(name || defaultBookmarkName(snap), snap)
        refreshBookmarks()
        setState((s) => ({
          ...s,
          statusMessage: `Bookmark saved · ${saved.name}`,
          panelOpen: true,
        }))
        return { ok: true, message: `Saved “${saved.name}”` }
      } catch {
        return { ok: false, message: 'Could not save bookmark (storage blocked?)' }
      }
    },
    [captureSnapshot, refreshBookmarks],
  )

  const quickBookmark = useCallback(() => saveBookmarkNamed(''), [saveBookmarkNamed])

  const restoreBookmark = useCallback(
    (id: string) => {
      const bookmark = getSceneBookmark(id)
      if (!bookmark) return { ok: false, message: 'Bookmark not found' }
      snapshotAppliedRef.current = false
      setPendingSnapshot(bookmark.snapshot)
      setState((s) => ({
        ...s,
        statusMessage: `Restoring bookmark · ${bookmark.name}`,
      }))
      return { ok: true, message: `Restoring “${bookmark.name}”…` }
    },
    [],
  )

  const renameBookmark = useCallback(
    (id: string, name: string) => {
      const updated = renameSceneBookmark(id, name)
      if (!updated) return { ok: false, message: 'Rename failed' }
      refreshBookmarks()
      return { ok: true, message: `Renamed to “${updated.name}”` }
    },
    [refreshBookmarks],
  )

  const removeBookmark = useCallback(
    (id: string) => {
      const ok = deleteSceneBookmark(id)
      if (!ok) return { ok: false, message: 'Delete failed' }
      refreshBookmarks()
      return { ok: true, message: 'Bookmark deleted' }
    },
    [refreshBookmarks],
  )

  const trackSkillById = useMemo(
    () => Object.fromEntries(live.trackSkills.map((s) => [s.trackId, s.composite])),
    [live.trackSkills],
  )

  const brandNote = useMemo(
    () =>
      state.viewMode === 'immersive'
        ? 'Immersive atmosphere · observation-driven clouds'
        : compareTrackIds.length > 1
          ? `Comparing ${compareTrackIds.length} cell volumes · procedural`
          : pinnedVolumeMode === 'cell' && followTrack
            ? 'Volume follows derived track · procedural'
            : pinnedVolumeMode === 'cell'
              ? 'Georegistered cell volume · procedural'
              : live.trackSkillSummary.trackCount > 0
                ? `Radar · tracks · skill mean ${Math.round(live.trackSkillSummary.meanComposite * 100)}%`
                : 'Radar · global cloud field · RainViewer',
    [
      state.viewMode,
      pinnedVolumeMode,
      followTrack,
      compareTrackIds.length,
      live.trackSkillSummary.trackCount,
      live.trackSkillSummary.meanComposite,
    ],
  )

  const clockLabel = useMemo(() => {
    if (!radarFrame) return live.loading ? 'Loading frames…' : 'No radar frames'
    return radarFrame.observedAt.replace('T', ' ').replace('.000Z', 'Z')
  }, [radarFrame, live.loading])

  const observedAtForSun =
    syncObservedAt ?? radarFrame?.observedAt ?? live.caseStudy?.focusObservedAt ?? null

  return (
    <AppShell
      brandNote={brandNote}
      statusMessage={state.statusMessage}
      overlay={
        <>
          <ExplorationControls
            viewMode={state.viewMode}
            lightingMode={state.lightingMode}
            layers={state.layers}
            reducedFlash={state.reducedFlash}
            satelliteAvailable={live.satelliteFrames.length > 0}
            tracksLoading={live.tracksLoading}
            lightningConfigured={live.lightningConfigured}
            lightningCount={filteredLightningEvents.length}
            volumePinned={pinnedVolumeMode === 'cell'}
            followTrack={followTrack}
            chaseVolume={chaseVolume}
            compareCount={compareTrackIds.length}
            cloudFieldLoading={live.cloudFieldLoading}
            hasSelectedTrack={Boolean(selectedTrack)}
            onLightingMode={(lightingMode: LightingMode) => setState((s) => ({ ...s, lightingMode }))}
            onLayers={setLayers}
            onReducedFlash={(reducedFlash) => setState((s) => ({ ...s, reducedFlash }))}
            onEnterImmersive={enterImmersive}
            onPinSelectedCell={pinSelectedCell}
            onCompareTop={compareTopTracks}
            onClearCompare={clearCompare}
            onFollowTrack={setFollowTrack}
            onChaseVolume={setChaseVolume}
            onExitImmersive={exitImmersive}
            onTogglePanel={() => setState((s) => ({ ...s, panelOpen: !s.panelOpen }))}
            onRefreshWeather={live.refresh}
          />
          <SceneShareControls
            disabled={live.loading}
            onExportJson={exportSceneJson}
            onCopyLink={copyShareLink}
            onImportText={importSceneText}
            onQuickBookmark={quickBookmark}
          />
          <InfoPanel
            open={state.panelOpen}
            viewMode={state.viewMode}
            availability={live.availability}
            environment={live.environment}
            tracks={live.tracks}
            selectedTrackId={selectedTrackId}
            reconstruction={globeVolumeTarget ?? previewReconstruction}
            compareVolumes={compareVolumes}
            trackSkills={live.trackSkills}
            trackSkillSummary={live.trackSkillSummary}
            trackTruthMatch={
              live.trackTruthMatches.find((m) => m.trackId === selectedTrackId) ?? null
            }
            trackTruthSummary={live.trackTruthSummary}
            truthConfigured={live.truthConfigured}
            truthLoading={live.truthLoading}
            truthError={live.truthError}
            truthSourceLabel={live.truthSourceLabel}
            bookmarks={bookmarks}
            radarLabel={
              radarFrame ? `${radarFrame.observedAt} · ${radarFrame.provenance.kind}` : null
            }
            tracksLoading={live.tracksLoading}
            lightningConfigured={live.lightningConfigured}
            lightningCount={live.lightningEvents.length}
            lightningVisibleCount={filteredLightningEvents.length}
            lightningLoading={live.lightningLoading}
            lightningError={live.lightningError}
            lightningSourceLabel={live.lightningSourceLabel}
            lightningEvents={live.lightningEvents}
            lightningFilter={lightningFilter}
            lightningSummary={lightningQualitySummary}
            crossProductReport={crossProductReport}
            lightningSyncMode={lightningSyncMode}
            caseStudy={live.caseStudy}
            caseStudyLoading={live.caseStudyLoading}
            caseStudyError={live.caseStudyError}
            caseStudyCatalog={live.caseStudyCatalog}
            caseStudyCatalogLoading={live.caseStudyCatalogLoading}
            caseStudyCatalogError={live.caseStudyCatalogError}
            caseStudyShelf={live.caseStudyShelf}
            volumePinned={pinnedVolumeMode === 'cell'}
            followTrack={followTrack}
            loading={live.loading}
            error={live.error}
            cloudFieldCount={live.cloudField.length}
            cloudTileCount={live.cloudTiles.length}
            cloudFieldSource={live.cloudFieldSource}
            cloudFieldLoading={live.cloudFieldLoading}
            cloudFieldError={live.cloudFieldError}
            onClose={() => setState((s) => ({ ...s, panelOpen: false }))}
            onEnterImmersive={enterImmersive}
            onPinSelectedCell={addSelectedToCompare}
            onFollowTrack={setFollowTrack}
            onCompareTop={compareTopTracks}
            onClearCompare={clearCompare}
            onRemoveCompare={removeFromCompare}
            onExitImmersive={exitImmersive}
            onSelectTrack={setSelectedTrackId}
            onLightningFilterChange={setLightningFilter}
            onLoadLightningSample={() => {
              live.loadLightningSample()
              setState((s) => ({
                ...s,
                panelOpen: true,
                layers: { ...s.layers, lightningObs: true },
                statusMessage: 'Loading sample lightning feed (example only)',
              }))
            }}
            onClearLightningFeed={() => {
              live.clearLightningFeed()
              setState((s) => ({
                ...s,
                statusMessage: 'Lightning feed cleared',
              }))
            }}
            onLightningSyncModeChange={(mode) => {
              setLightningSyncMode(mode)
              setState((s) => ({
                ...s,
                statusMessage:
                  mode === 'off'
                    ? 'Globe lightning time sync off'
                    : mode === 'radar'
                      ? 'Globe lightning synced to radar observation time'
                      : 'Globe lightning synced to case-study clock',
              }))
            }}
            onLoadCaseStudyById={(id) => {
              live.loadCaseStudyById(id)
              setSelectedTrackId(null)
              setCompareTrackIds([])
              setState((s) => ({
                ...s,
                panelOpen: true,
                layers: { ...s.layers, tracks: true, lightningObs: true },
                statusMessage: `Loading case study ${id} (check catalog licence note)`,
              }))
            }}
            onLoadCaseStudyShelfId={(shelfId) => {
              const result = live.loadCaseStudyFromShelfId(shelfId)
              if (result.ok) {
                setSelectedTrackId(null)
                setCompareTrackIds([])
                setState((s) => ({
                  ...s,
                  panelOpen: true,
                  layers: { ...s.layers, tracks: true, lightningObs: true },
                  statusMessage: result.message,
                }))
              } else {
                setState((s) => ({ ...s, statusMessage: result.message }))
              }
              return result
            }}
            onDeleteCaseStudyShelfId={(shelfId) => {
              const result = live.deleteCaseStudyShelfEntry(shelfId)
              setState((s) => ({ ...s, statusMessage: result.message }))
              return result
            }}
            onBackupCaseStudyShelf={() => {
              const result = live.backupCaseStudyShelf()
              setState((s) => ({ ...s, statusMessage: result.message }))
              return result
            }}
            onRestoreCaseStudyShelfText={(text, opts) => {
              const result = live.restoreCaseStudyShelfText(text, opts)
              setState((s) => ({ ...s, statusMessage: result.message }))
              return result
            }}
            onImportCaseStudyText={(text, opts) => {
              const result = live.importCaseStudyText(text, opts)
              if (result.ok) {
                setSelectedTrackId(null)
                setCompareTrackIds([])
                setState((s) => ({
                  ...s,
                  panelOpen: true,
                  layers: { ...s.layers, tracks: true, lightningObs: true },
                  statusMessage: result.message,
                }))
              } else {
                setState((s) => ({ ...s, statusMessage: result.message }))
              }
              return result
            }}
            onClearCaseStudy={() => {
              live.clearCaseStudy()
              setSelectedTrackId(null)
              setCompareTrackIds([])
              setState((s) => ({
                ...s,
                statusMessage: 'Case study cleared — returning to live derived tracks',
              }))
            }}
            canUseTracksAsTruth={live.tracks.length > 0}
            onLoadTruthSample={() => {
              live.loadTruthSample()
              setState((s) => ({
                ...s,
                panelOpen: true,
                statusMessage: 'Loading sample truth-cell catalogue (example only)',
              }))
            }}
            onUseTracksAsTruth={() => {
              live.loadTruthFromTracks()
              setState((s) => ({
                ...s,
                panelOpen: true,
                statusMessage:
                  'Stand-in truth loaded from derived tracks — not independent verification',
              }))
            }}
            onClearTruthCatalogue={() => {
              live.clearTruthCatalogue()
              setState((s) => ({
                ...s,
                statusMessage: 'Truth-cell catalogue cleared',
              }))
            }}
            onExportTruthTemplate={() => {
              if (live.tracks.length === 0) {
                setState((s) => ({
                  ...s,
                  statusMessage: 'No derived tracks to export as truth template',
                }))
                return
              }
              downloadTruthCellsTemplate(live.tracks)
              setState((s) => ({
                ...s,
                statusMessage: `Exported ${live.tracks.length} track midpoints as truth template`,
              }))
            }}
            onRefreshBookmarks={refreshBookmarks}
            onSaveBookmark={saveBookmarkNamed}
            onRestoreBookmark={restoreBookmark}
            onRenameBookmark={renameBookmark}
            onDeleteBookmark={removeBookmark}
          />
          <TimelineBar
            clockLabel={clockLabel}
            note={
              followTrack && pinnedVolumeMode === 'cell'
                ? 'Live mosaic only — pinned volumes sit at the latest derived-track pose (not scrubbed history).'
                : 'Live Earth weather from the current RainViewer mosaic — processed imagery, not a BoM volume product. Sun lighting follows observation UTC when Follow sun is active.'
            }
            badge="Live observation"
            frameCount={live.radarFrames.length}
            onRefreshLive={() => live.refresh()}
          />
        </>
      }
    >
      <GlobeView
        active
        immersive={state.viewMode === 'immersive'}
        requestFlyHome={flyHomeToken}
        requestEnterImmersive={enterImmersiveToken}
        immersiveFocus={immersiveFocus}
        flyTarget={flyTarget}
        onEnterImmersive={enterImmersive}
        onTrackSelect={setSelectedTrackId}
        radarFrame={radarFrame}
        satelliteFrame={satelliteFrame}
        radarVisible={state.layers.radar}
        satelliteVisible={state.layers.satellite}
        tracks={live.tracks}
        tracksVisible={state.layers.tracks}
        selectedTrackId={selectedTrackId}
        trackSkillById={trackSkillById}
        lightningEvents={filteredLightningEvents}
        lightningVisible={state.layers.lightningObs && !state.reducedFlash ? true : state.layers.lightningObs}
        volumeTarget={globeVolumeTarget}
        volumeTargets={globeVolumeTargets}
        volumeVisible={state.layers.volume}
        cloudField={live.cloudField}
        cloudTiles={live.cloudTiles}
        cloudsVisible={state.layers.clouds}
        precipitationVisible={state.layers.precipitation}
        lightingMode={state.lightingMode}
        observedAt={observedAtForSun}
        focusLon={immersiveFocus.lon}
        focusLat={immersiveFocus.lat}
      />
    </AppShell>
  )
}
