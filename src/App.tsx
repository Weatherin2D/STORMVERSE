import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { GlobeView } from './components/globe/GlobeView'
import { StormView } from './components/storm/StormView'
import { ExplorationControls } from './components/controls/ExplorationControls'
import { InfoPanel } from './components/panels/InfoPanel'
import { TimelineBar } from './components/timeline/TimelineBar'
import { createInitialAppState, type LayerState } from './lib/appState'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useLiveWeather } from './hooks/useLiveWeather'
import type { StormCameraPreset } from './rendering/storm/StormControls'
import type { LightingMode } from './rendering/atmosphere/lighting'
import type { CloudParams } from './rendering/clouds/CloudVolume'
import { prototypeProvider, type LightningObservation } from './weather'
import { PROTOTYPE_STORM, TIMELINE } from './config/app'

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [state, setState] = useState(() => createInitialAppState(reducedMotion))
  const live = useLiveWeather(state.layers.tracks)
  const [flyStormToken, setFlyStormToken] = useState(0)
  const [flyHomeToken, setFlyHomeToken] = useState(0)
  const [presetToken, setPresetToken] = useState(0)
  const [lightningToken, setLightningToken] = useState(0)
  const [lightningEvent, setLightningEvent] = useState<LightningObservation | null>(null)
  const [syntheticLightning, setSyntheticLightning] = useState<LightningObservation[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)

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
      return
    }
    setSelectedTrackId((prev) =>
      prev && live.tracks.some((t) => t.id === prev) ? prev : live.tracks[0].id,
    )
  }, [live.tracks])

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
          : `Live radar · ${live.radarFrames.length} frames${trackNote}`,
      }
    })
  }, [live.radarFrames, live.error, live.tracks, live.tracksLoading, state.layers.tracks])

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

  const lastLightningId = useRef<string | null>(null)
  useEffect(() => {
    if (state.viewMode !== 'storm' || !state.layers.lightning) return
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
    state.viewMode,
    state.layers.lightning,
    state.timeline.speed,
    syntheticLightning,
  ])

  const enterStorm = useCallback(() => {
    setState((s) => ({
      ...s,
      viewMode: 'storm',
      statusMessage: `${PROTOTYPE_STORM.name} - synthetic demonstration environment`,
      panelOpen: true,
      timeline: {
        playing: true,
        cursor: 0,
        speed: TIMELINE.defaultSpeed,
        max: TIMELINE.durationSec,
      },
    }))
    setPresetToken((n) => n + 1)
  }, [])

  const returnGlobe = useCallback(() => {
    const max = Math.max(0, live.radarFrames.length - 1)
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
      setFlyStormToken((n) => n + 1)
      setState((s) => ({
        ...s,
        statusMessage: 'Approaching prototype storm...',
      }))
      window.setTimeout(() => enterStorm(), 1400)
      return
    }
    enterStorm()
  }, [enterStorm, state.viewMode])

  const setLayers = (partial: Partial<LayerState>) => {
    setState((s) => ({ ...s, layers: { ...s.layers, ...partial } }))
  }

  const brandNote = useMemo(
    () =>
      state.viewMode === 'globe'
        ? 'Global exploration · radar + derived tracks'
        : 'Storm environment · not live weather',
    [state.viewMode],
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
            onReturnGlobe={returnGlobe}
            onTogglePanel={() => setState((s) => ({ ...s, panelOpen: !s.panelOpen }))}
            onDemoLightning={() => {
              setLightningEvent(null)
              setLightningToken((n) => n + 1)
            }}
            onRefreshWeather={live.refresh}
          />
          <InfoPanel
            open={state.panelOpen}
            viewMode={state.viewMode}
            availability={live.availability}
            environment={live.environment}
            tracks={live.tracks}
            selectedTrackId={selectedTrackId}
            radarLabel={
              radarFrame ? `${radarFrame.observedAt} · ${radarFrame.provenance.kind}` : null
            }
            tracksLoading={live.tracksLoading}
            loading={live.loading}
            error={live.error}
            onClose={() => setState((s) => ({ ...s, panelOpen: false }))}
            onEnterStorm={approachThenEnter}
            onReturnGlobe={returnGlobe}
            onSelectTrack={setSelectedTrackId}
          />
          <TimelineBar
            viewMode={state.viewMode}
            timeline={state.timeline}
            clockLabel={clockLabel}
            note={
              state.viewMode === 'globe'
                ? 'Scrubs RainViewer composite radar frames — processed imagery, not a BoM volume product.'
                : 'Controls synthetic storm animation — not real-time weather observations.'
            }
            badge={state.viewMode === 'globe' ? 'Observation time' : 'Prototype simulation time'}
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
          onEnterStorm={enterStorm}
          onTrackSelect={setSelectedTrackId}
          radarFrame={radarFrame}
          satelliteFrame={satelliteFrame}
          radarVisible={state.layers.radar}
          satelliteVisible={state.layers.satellite}
          tracks={live.tracks}
          tracksVisible={state.layers.tracks}
          selectedTrackId={selectedTrackId}
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
