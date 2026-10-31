import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { GlobeView } from './components/globe/GlobeView'
import { StormView } from './components/storm/StormView'
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
  resolveTimelineCursor,
  snapshotFromJson,
  type SceneSnapshot,
} from './lib/sceneSnapshot'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useLiveWeather } from './hooks/useLiveWeather'
import type { StormCameraPreset } from './rendering/storm/StormControls'
import type { LightingMode } from './rendering/atmosphere/lighting'
import type { CloudParams } from './rendering/clouds/CloudVolume'
import {
  interpolateTrackAtCursor,
  mapEnvironmentToReconstruction,
  prototypeProvider,
  type LightningObservation,
  type ReconstructionTarget,
} from './weather'
import { TIMELINE } from './config/app'
import { accentForIndex, MAX_COMPARE_VOLUMES } from './config/compare'
import { SceneShareControls } from './components/controls/SceneShareControls'

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [state, setState] = useState(() => createInitialAppState(reducedMotion))
  const live = useLiveWeather(state.layers.tracks)
  const [flyStormToken, setFlyStormToken] = useState(0)
  const [flyHomeToken, setFlyHomeToken] = useState(0)
  const [flyTarget, setFlyTarget] = useState<{
    lon: number
    lat: number
    height: number
    token: number
    oblique?: boolean
  } | null>(null)
  const [presetToken, setPresetToken] = useState(0)
  const [lightningToken, setLightningToken] = useState(0)
  const [lightningEvent, setLightningEvent] = useState<LightningObservation | null>(null)
  const [syntheticLightning, setSyntheticLightning] = useState<LightningObservation[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [reconMode, setReconMode] = useState<'prototype' | 'cell'>('prototype')
  const [pinnedVolumeMode, setPinnedVolumeMode] = useState<'prototype' | 'cell' | null>(
    'prototype',
  )
  const [pinnedVolumeSnapshot, setPinnedVolumeSnapshot] = useState(() =>
    mapEnvironmentToReconstruction(null, null),
  )
  /** Track ids pinned for multi-cell volume comparison (selected is primary). */
  const [compareTrackIds, setCompareTrackIds] = useState<string[]>([])
  /** When true, pinned cell volumes follow derived tracks through observation time. */
  const [followTrack, setFollowTrack] = useState(true)
  const [chaseVolume, setChaseVolume] = useState(false)
  const [pendingSnapshot, setPendingSnapshot] = useState<SceneSnapshot | null>(() =>
    typeof window !== 'undefined' ? decodeSceneHash(window.location.hash) : null,
  )
  const snapshotAppliedRef = useRef(false)

  useEffect(() => {
    setState((s) => ({ ...s, reducedFlash: reducedMotion || s.reducedFlash }))
  }, [reducedMotion])

  useEffect(() => {
    let cancelled = false
    prototypeProvider.getLightning({}).then((events) => {
      if (!cancelled) setSyntheticLightning(events)
    })
    return () => {
      cancelled = true
    }
  }, [])

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

  const reconstruction = useMemo(
    () => mapEnvironmentToReconstruction(live.environment, reconMode === 'cell' ? selectedTrack : null),
    [live.environment, reconMode, selectedTrack],
  )

  const previewReconstruction = useMemo(
    () => mapEnvironmentToReconstruction(live.environment, selectedTrack),
    [live.environment, selectedTrack],
  )

  // Keep prototype pin in sync with latest CAPE; cell pin uses explicit snapshot / track animation.
  useEffect(() => {
    if (pinnedVolumeMode !== 'prototype') return
    setPinnedVolumeSnapshot(mapEnvironmentToReconstruction(live.environment, null))
  }, [live.environment, pinnedVolumeMode])

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
          ? interpolateTrackAtCursor(track, live.radarFrames, state.timeline.cursor)
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
    state.timeline.cursor,
  ])

  const globeVolumeTargets = useMemo(() => {
    if (pinnedVolumeMode === 'cell') return compareVolumes
    if (pinnedVolumeMode === 'prototype' && pinnedVolumeSnapshot) {
      return [{ ...pinnedVolumeSnapshot, accentCss: accentForIndex(0), primary: true }]
    }
    return [] as ReconstructionTarget[]
  }, [pinnedVolumeMode, compareVolumes, pinnedVolumeSnapshot])

  const globeVolumeTarget = globeVolumeTargets.find((t) => t.primary) ?? globeVolumeTargets[0] ?? null

  // Optional gentle chase camera while the primary volume walks its track
  const lastChaseRef = useRef(0)
  useEffect(() => {
    if (!chaseVolume || !followTrack || pinnedVolumeMode !== 'cell') return
    if (!globeVolumeTarget || state.viewMode !== 'globe') return
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
    state.viewMode,
  ])

  useEffect(() => {
    if (live.radarFrames.length === 0) return
    setState((s) => {
      if (s.viewMode !== 'globe') return s
      const max = Math.max(0, live.radarFrames.length - 1)
      const trackNote =
        s.layers.tracks && live.tracks.length > 0
          ? ` · ${live.tracks.length} derived track(s)`
          : live.tracksLoading
            ? ' · deriving tracks…'
            : ''
      const lghtNote =
        live.lightningConfigured && live.lightningEvents.length > 0
          ? ` · ${live.lightningEvents.length} lightning`
          : ''
      return {
        ...s,
        timeline: {
          ...s.timeline,
          max,
          cursor: max,
          playing: true,
        },
        statusMessage: live.error
          ? `Radar feed error: ${live.error}`
          : `Live radar · ${live.radarFrames.length} frames${trackNote}${lghtNote}`,
      }
    })
  }, [
    live.radarFrames,
    live.error,
    live.tracks,
    live.tracksLoading,
    live.lightningConfigured,
    live.lightningEvents.length,
    state.layers.tracks,
  ])

  useEffect(() => {
    if (!state.timeline.playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setState((s) => {
        if (!s.timeline.playing) return s
        if (s.viewMode === 'globe') {
          const next = s.timeline.cursor + dt * s.timeline.speed * (1 / 0.7)
          const wrapped = next > s.timeline.max ? 0 : next
          return { ...s, timeline: { ...s.timeline, cursor: wrapped } }
        }
        const next = s.timeline.cursor + dt * s.timeline.speed
        const wrapped = next >= s.timeline.max ? 0 : next
        return { ...s, timeline: { ...s.timeline, cursor: wrapped } }
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state.timeline.playing, state.timeline.speed, state.viewMode])

  const radarIndex = Math.min(
    live.radarFrames.length - 1,
    Math.max(0, Math.round(state.timeline.cursor)),
  )
  const radarFrame =
    state.viewMode === 'globe' && live.radarFrames.length > 0
      ? live.radarFrames[radarIndex]
      : null

  const satIndex = Math.min(
    live.satelliteFrames.length - 1,
    Math.max(0, Math.round(state.timeline.cursor)),
  )
  const satelliteFrame =
    state.viewMode === 'globe' &&
    state.layers.satellite &&
    live.satelliteFrames.length > 0
      ? live.satelliteFrames[Math.min(satIndex, live.satelliteFrames.length - 1)]
      : live.satelliteFrames.length > 0
        ? live.satelliteFrames[live.satelliteFrames.length - 1]
        : null

  // Storm-view lightning: prefer feed events near reconstruction focus when available
  const lastLightningId = useRef<string | null>(null)
  useEffect(() => {
    if (state.viewMode !== 'storm' || !state.layers.lightning) return
    if (live.lightningEvents.length > 0 && reconMode === 'cell') {
      // Map timeline cursor into feed events by index cadence
      const idx = Math.min(
        live.lightningEvents.length - 1,
        Math.floor((state.timeline.cursor / Math.max(1, state.timeline.max)) * live.lightningEvents.length),
      )
      const hit = live.lightningEvents[idx]
      if (hit && hit.id !== lastLightningId.current) {
        lastLightningId.current = hit.id
        setLightningEvent(hit)
        setLightningToken((n) => n + 1)
      }
      return
    }
    const base = Date.parse(prototypeProvider.getBaseTimeIso())
    const t = base + state.timeline.cursor * 1000
    const windowMs = 900 * Math.max(1, state.timeline.speed)
    const hit = syntheticLightning.find((e) => {
      const et = Date.parse(e.observedAt)
      return et >= t - windowMs && et <= t + windowMs
    })
    if (hit && hit.id !== lastLightningId.current) {
      lastLightningId.current = hit.id
      setLightningEvent(hit)
      setLightningToken((n) => n + 1)
    }
  }, [
    state.timeline.cursor,
    state.timeline.max,
    state.viewMode,
    state.layers.lightning,
    state.timeline.speed,
    syntheticLightning,
    live.lightningEvents,
    reconMode,
  ])

  const openStormView = useCallback(
    (mode: 'prototype' | 'cell') => {
      setReconMode(mode)
      const recon = mapEnvironmentToReconstruction(
        live.environment,
        mode === 'cell' ? selectedTrack : null,
      )
      setState((s) => ({
        ...s,
        viewMode: 'storm',
        cloudParams: recon.cloudParams,
        flashFreq: recon.flashFreq,
        statusMessage: recon.provenance.summary,
        panelOpen: true,
        timeline: {
          playing: true,
          cursor: 0,
          speed: TIMELINE.defaultSpeed,
          max: TIMELINE.durationSec,
        },
      }))
      setPresetToken((n) => n + 1)
    },
    [live.environment, selectedTrack],
  )

  const enterStorm = useCallback(() => {
    openStormView('prototype')
  }, [openStormView])

  const pinSelectedCell = useCallback(() => {
    if (!selectedTrack) return
    const pose = interpolateTrackAtCursor(
      selectedTrack,
      live.radarFrames,
      state.timeline.cursor,
    )
    const recon = mapEnvironmentToReconstruction(live.environment, selectedTrack, pose)
    setPinnedVolumeSnapshot(recon)
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
  }, [live.environment, live.radarFrames, selectedTrack, state.timeline.cursor])

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
    const pose = interpolateTrackAtCursor(top[0], live.radarFrames, state.timeline.cursor)
    const recon = mapEnvironmentToReconstruction(live.environment, top[0], pose)
    setPinnedVolumeSnapshot(recon)
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
  }, [live.tracks, live.radarFrames, live.environment, state.timeline.cursor])

  const clearCompare = useCallback(() => {
    setCompareTrackIds([])
    setPinnedVolumeMode('prototype')
    setChaseVolume(false)
    setState((s) => ({
      ...s,
      statusMessage: 'Cleared compare volumes',
    }))
  }, [])

  const removeFromCompare = useCallback((trackId: string) => {
    setCompareTrackIds((prev) => {
      const next = prev.filter((id) => id !== trackId)
      if (next.length === 0) setPinnedVolumeMode('prototype')
      return next
    })
  }, [])

  const enterSelectedCell = useCallback(() => {
    if (!selectedTrack) return
    const recon = mapEnvironmentToReconstruction(live.environment, selectedTrack)
    setPinnedVolumeSnapshot(recon)
    setPinnedVolumeMode('cell')
    setCompareTrackIds((prev) =>
      prev.includes(selectedTrack.id) ? prev : [...prev, selectedTrack.id].slice(-MAX_COMPARE_VOLUMES),
    )
    setFlyTarget({
      lon: recon.longitude,
      lat: recon.latitude,
      height: 380_000,
      token: Date.now(),
    })
    setState((s) => ({
      ...s,
      layers: { ...s.layers, volume: true },
      statusMessage: `Approaching derived cell ${selectedTrack.stormId}…`,
    }))
    window.setTimeout(() => openStormView('cell'), 1400)
  }, [live.environment, openStormView, selectedTrack])

  const returnGlobe = useCallback(() => {
    const max = Math.max(0, live.radarFrames.length - 1)
    setReconMode('prototype')
    setState((s) => ({
      ...s,
      viewMode: 'globe',
      statusMessage:
        live.radarFrames.length > 0
          ? `Live radar · ${live.radarFrames.length} frames · RainViewer`
          : 'Returned to Earth view',
      timeline: {
        playing: true,
        cursor: max,
        speed: TIMELINE.defaultSpeed,
        max,
      },
    }))
    setFlyHomeToken((n) => n + 1)
  }, [live.radarFrames.length])

  const approachThenEnter = useCallback(() => {
    if (state.viewMode === 'globe') {
      const recon = mapEnvironmentToReconstruction(live.environment, null)
      setPinnedVolumeSnapshot(recon)
      setPinnedVolumeMode('prototype')
      setFlyStormToken((n) => n + 1)
      setState((s) => ({
        ...s,
        layers: { ...s.layers, volume: true },
        statusMessage: 'Approaching prototype storm...',
      }))
      window.setTimeout(() => enterStorm(), 1400)
      return
    }
    enterStorm()
  }, [enterStorm, live.environment, state.viewMode])

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
      state.viewMode === 'globe' && live.radarFrames.length > 0
        ? live.radarFrames[
            Math.min(live.radarFrames.length - 1, Math.max(0, Math.round(state.timeline.cursor)))
          ]?.observedAt
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
        : globeVolumeTarget
          ? {
              lon: globeVolumeTarget.longitude,
              lat: globeVolumeTarget.latitude,
              height: 220_000,
              oblique: true,
            }
          : undefined,
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
    globeVolumeTarget,
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

      const cursor = resolveTimelineCursor(snap, {
        frameCount: live.radarFrames.length,
        observedAts: live.radarFrames.map((f) => f.observedAt),
        stormDurationSec: TIMELINE.durationSec,
      })
      const max =
        snap.viewMode === 'globe'
          ? Math.max(0, live.radarFrames.length - 1)
          : TIMELINE.durationSec

      setFollowTrack(snap.exploration.followTrack)
      setChaseVolume(snap.exploration.chaseVolume)
      setCompareTrackIds(compareIds)
      setSelectedTrackId(selected)
      setPinnedVolumeMode(snap.exploration.pinnedVolumeMode)
      setReconMode(snap.viewMode === 'storm' ? (selected ? 'cell' : 'prototype') : 'prototype')

      if (selected && snap.exploration.pinnedVolumeMode === 'cell') {
        const track = live.tracks.find((t) => t.id === selected) ?? null
        if (track) {
          const pose =
            snap.exploration.followTrack && live.radarFrames.length > 0
              ? interpolateTrackAtCursor(track, live.radarFrames, cursor)
              : null
          setPinnedVolumeSnapshot(
            mapEnvironmentToReconstruction(live.environment, track, pose),
          )
        }
      }

      setState((s) => ({
        ...s,
        viewMode: snap.viewMode,
        lightingMode: snap.lightingMode,
        layers: { ...s.layers, ...snap.layers },
        reducedFlash: snap.exploration.reducedFlash,
        panelOpen: snap.exploration.panelOpen,
        timeline: {
          playing: snap.timeline.playing,
          speed: snap.timeline.speed,
          cursor,
          max,
        },
        statusMessage: `Restored scene snapshot · ${snap.exportedAt.replace('T', ' ').slice(0, 19)}Z`,
      }))

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

  // Apply URL/imported snapshot once radar (and preferably tracks) are ready.
  useEffect(() => {
    if (!pendingSnapshot || snapshotAppliedRef.current) return
    if (live.loading) return
    if (pendingSnapshot.viewMode === 'globe' && live.radarFrames.length === 0) return
    // Wait for track derivation when the snapshot references cells
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

  const trackSkillById = useMemo(
    () => Object.fromEntries(live.trackSkills.map((s) => [s.trackId, s.composite])),
    [live.trackSkills],
  )

  const brandNote = useMemo(
    () =>
      state.viewMode === 'globe'
        ? compareTrackIds.length > 1
          ? `Comparing ${compareTrackIds.length} cell volumes · procedural`
          : pinnedVolumeMode === 'cell' && followTrack
            ? 'Volume follows derived track · procedural'
            : pinnedVolumeMode === 'cell'
              ? 'Georegistered cell volume · procedural'
              : live.trackSkillSummary.trackCount > 0
                ? `Radar · tracks · skill mean ${Math.round(live.trackSkillSummary.meanComposite * 100)}%`
                : 'Radar · tracks · georegistered volume'
        : reconMode === 'cell'
          ? 'Cell-informed reconstruction · not measured volume'
          : 'Prototype storm · synthetic demonstration',
    [
      state.viewMode,
      reconMode,
      pinnedVolumeMode,
      followTrack,
      compareTrackIds.length,
      live.trackSkillSummary.trackCount,
      live.trackSkillSummary.meanComposite,
    ],
  )

  const clockLabel = useMemo(() => {
    if (state.viewMode === 'globe') {
      if (!radarFrame) return live.loading ? 'Loading frames…' : 'No radar frames'
      return radarFrame.observedAt.replace('T', ' ').replace('.000Z', 'Z')
    }
    return prototypeProvider
      .simTimeToIso(state.timeline.cursor)
      .replace('T', ' ')
      .replace('.000Z', 'Z')
  }, [state.viewMode, state.timeline.cursor, radarFrame, live.loading])

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
            debugOpen={state.debugOpen}
            cloudParams={state.cloudParams}
            satelliteAvailable={live.satelliteFrames.length > 0}
            tracksLoading={live.tracksLoading}
            lightningConfigured={live.lightningConfigured}
            lightningCount={live.lightningEvents.length}
            volumePinned={pinnedVolumeMode === 'cell'}
            followTrack={followTrack}
            chaseVolume={chaseVolume}
            compareCount={compareTrackIds.length}
            hasSelectedTrack={Boolean(selectedTrack)}
            onLightingMode={(lightingMode: LightingMode) => setState((s) => ({ ...s, lightingMode }))}
            onLayers={setLayers}
            onPreset={(cameraPreset: StormCameraPreset) => {
              setState((s) => ({ ...s, cameraPreset }))
              setPresetToken((n) => n + 1)
            }}
            onReducedFlash={(reducedFlash) => setState((s) => ({ ...s, reducedFlash }))}
            onToggleDebug={() => setState((s) => ({ ...s, debugOpen: !s.debugOpen }))}
            onCloudParams={(partial: Partial<CloudParams>) =>
              setState((s) => ({ ...s, cloudParams: { ...s.cloudParams, ...partial } }))
            }
            onEnterStorm={approachThenEnter}
            onPinSelectedCell={pinSelectedCell}
            onEnterSelectedCell={enterSelectedCell}
            onCompareTop={compareTopTracks}
            onClearCompare={clearCompare}
            onFollowTrack={setFollowTrack}
            onChaseVolume={setChaseVolume}
            onReturnGlobe={returnGlobe}
            onTogglePanel={() => setState((s) => ({ ...s, panelOpen: !s.panelOpen }))}
            onDemoLightning={() => {
              setLightningEvent(null)
              setLightningToken((n) => n + 1)
            }}
            onRefreshWeather={live.refresh}
          />
          <SceneShareControls
            disabled={live.loading}
            onExportJson={exportSceneJson}
            onCopyLink={copyShareLink}
            onImportText={importSceneText}
          />
          <InfoPanel
            open={state.panelOpen}
            viewMode={state.viewMode}
            availability={live.availability}
            environment={live.environment}
            tracks={live.tracks}
            selectedTrackId={selectedTrackId}
            reconstruction={
              state.viewMode === 'storm'
                ? reconstruction
                : globeVolumeTarget ?? previewReconstruction
            }
            compareVolumes={compareVolumes}
            trackSkills={live.trackSkills}
            trackSkillSummary={live.trackSkillSummary}
            radarLabel={
              radarFrame ? `${radarFrame.observedAt} · ${radarFrame.provenance.kind}` : null
            }
            tracksLoading={live.tracksLoading}
            lightningConfigured={live.lightningConfigured}
            lightningCount={live.lightningEvents.length}
            volumePinned={pinnedVolumeMode === 'cell'}
            followTrack={followTrack}
            loading={live.loading}
            error={live.error}
            onClose={() => setState((s) => ({ ...s, panelOpen: false }))}
            onEnterStorm={approachThenEnter}
            onPinSelectedCell={addSelectedToCompare}
            onEnterSelectedCell={enterSelectedCell}
            onFollowTrack={setFollowTrack}
            onCompareTop={compareTopTracks}
            onClearCompare={clearCompare}
            onRemoveCompare={removeFromCompare}
            onReturnGlobe={returnGlobe}
            onSelectTrack={setSelectedTrackId}
          />
          <TimelineBar
            viewMode={state.viewMode}
            timeline={state.timeline}
            clockLabel={clockLabel}
            note={
              state.viewMode === 'globe'
                ? followTrack && pinnedVolumeMode === 'cell'
                  ? compareTrackIds.length > 1
                    ? 'Scrubs radar frames and walks all compare volumes along their derived tracks.'
                    : 'Scrubs radar frames and walks the pinned procedural volume along the derived track.'
                  : 'Scrubs RainViewer composite radar frames — processed imagery, not a BoM volume product.'
                : reconMode === 'cell'
                  ? 'Prototype animation clock for a cell-informed reconstruction — not observation time.'
                  : 'Controls synthetic storm animation — not real-time weather observations.'
            }
            badge={
              state.viewMode === 'globe' ? 'Observation time' : 'Prototype simulation time'
            }
            onChange={(partial) =>
              setState((s) => ({ ...s, timeline: { ...s.timeline, ...partial } }))
            }
            onReset={() =>
              setState((s) => ({
                ...s,
                timeline: {
                  ...s.timeline,
                  cursor: s.viewMode === 'globe' ? s.timeline.max : 0,
                  playing: true,
                },
              }))
            }
          />
        </>
      }
    >
      {state.viewMode === 'globe' ? (
        <GlobeView
          active
          requestFlyToStorm={flyStormToken}
          requestFlyHome={flyHomeToken}
          flyTarget={flyTarget}
          onEnterStorm={enterStorm}
          onTrackSelect={setSelectedTrackId}
          radarFrame={radarFrame}
          satelliteFrame={satelliteFrame}
          radarVisible={state.layers.radar}
          satelliteVisible={state.layers.satellite}
          tracks={live.tracks}
          tracksVisible={state.layers.tracks}
          selectedTrackId={selectedTrackId}
          trackSkillById={trackSkillById}
          lightningEvents={live.lightningEvents}
          lightningVisible={state.layers.lightningObs}
          volumeTarget={globeVolumeTarget}
          volumeTargets={globeVolumeTargets}
          volumeVisible={state.layers.volume}
        />
      ) : (
        <StormView
          active
          paused={!state.timeline.playing}
          lightingMode={state.lightingMode}
          layers={state.layers}
          cloudParams={state.cloudParams}
          flashFreq={state.flashFreq}
          simTime={state.timeline.cursor}
          reducedFlash={state.reducedFlash}
          cameraPreset={state.cameraPreset}
          presetToken={presetToken}
          lightningEvent={lightningEvent}
          lightningToken={lightningToken}
        />
      )}
    </AppShell>
  )
}
