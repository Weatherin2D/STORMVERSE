import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { GlobeView } from './components/globe/GlobeView'
import { StormView } from './components/storm/StormView'
import { ExplorationControls } from './components/controls/ExplorationControls'
import { InfoPanel } from './components/panels/InfoPanel'
import { TimelineBar } from './components/timeline/TimelineBar'
import { createInitialAppState, type LayerState } from './lib/appState'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import type { StormCameraPreset } from './rendering/storm/StormControls'
import type { LightingMode } from './rendering/atmosphere/lighting'
import type { CloudParams } from './rendering/clouds/CloudVolume'
import {
  prototypeProvider,
  type LightningObservation,
  type WeatherObservationMeta,
} from './weather'
import { PROTOTYPE_STORM } from './config/app'

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [state, setState] = useState(() => createInitialAppState(reducedMotion))
  const [flyStormToken, setFlyStormToken] = useState(0)
  const [flyHomeToken, setFlyHomeToken] = useState(0)
  const [presetToken, setPresetToken] = useState(0)
  const [lightningToken, setLightningToken] = useState(0)
  const [lightningEvent, setLightningEvent] = useState<LightningObservation | null>(null)
  const [availability, setAvailability] = useState<WeatherObservationMeta[]>([])
  const [syntheticLightning, setSyntheticLightning] = useState<LightningObservation[]>([])

  useEffect(() => {
    setState((s) => ({ ...s, reducedFlash: reducedMotion || s.reducedFlash }))
  }, [reducedMotion])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [avail, events] = await Promise.all([
        prototypeProvider.getAvailability(),
        prototypeProvider.getLightning({}),
      ])
      if (cancelled) return
      setAvailability(avail)
      setSyntheticLightning(events)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Timeline clock — updates sim time; triggers synthetic lightning near event times
  useEffect(() => {
    if (state.viewMode !== 'storm') return
    if (!state.timeline.playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setState((s) => {
        if (!s.timeline.playing) return s
        const next = s.timeline.simTime + dt * s.timeline.speed
        const wrapped = next >= s.timeline.duration ? 0 : next
        return {
          ...s,
          timeline: { ...s.timeline, simTime: wrapped },
        }
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state.viewMode, state.timeline.playing, state.timeline.speed])

  // Fire each synthetic lightning event once when sim time crosses it
  const lastLightningId = useRef<string | null>(null)
  useEffect(() => {
    if (state.viewMode !== 'storm' || !state.layers.lightning) return
    const base = Date.parse(prototypeProvider.getBaseTimeIso())
    const t = base + state.timeline.simTime * 1000
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
    state.timeline.simTime,
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
    }))
    setPresetToken((n) => n + 1)
  }, [])

  const returnGlobe = useCallback(() => {
    setState((s) => ({
      ...s,
      viewMode: 'globe',
      statusMessage: 'Returned to Earth view',
    }))
    setFlyHomeToken((n) => n + 1)
  }, [])

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

  const setLightingMode = (lightingMode: LightingMode) => {
    setState((s) => ({ ...s, lightingMode }))
  }

  const setPreset = (cameraPreset: StormCameraPreset) => {
    setState((s) => ({ ...s, cameraPreset }))
    setPresetToken((n) => n + 1)
  }

  const setCloudParams = (partial: Partial<CloudParams>) => {
    setState((s) => ({ ...s, cloudParams: { ...s.cloudParams, ...partial } }))
  }

  const brandNote = useMemo(
    () =>
      state.viewMode === 'globe'
        ? 'Global exploration · Australia-first prototype'
        : 'Storm environment · not live weather',
    [state.viewMode],
  )

  return (
    <AppShell brandNote={brandNote} statusMessage={state.statusMessage} overlay={
      <>
        <ExplorationControls
          viewMode={state.viewMode}
          lightingMode={state.lightingMode}
          layers={state.layers}
          reducedFlash={state.reducedFlash}
          debugOpen={state.debugOpen}
          cloudParams={state.cloudParams}
          onLightingMode={setLightingMode}
          onLayers={setLayers}
          onPreset={setPreset}
          onReducedFlash={(reducedFlash) => setState((s) => ({ ...s, reducedFlash }))}
          onToggleDebug={() => setState((s) => ({ ...s, debugOpen: !s.debugOpen }))}
          onCloudParams={setCloudParams}
          onEnterStorm={approachThenEnter}
          onReturnGlobe={returnGlobe}
          onTogglePanel={() => setState((s) => ({ ...s, panelOpen: !s.panelOpen }))}
          onDemoLightning={() => {
            setLightningEvent(null)
            setLightningToken((n) => n + 1)
          }}
        />
        <InfoPanel
          open={state.panelOpen}
          viewMode={state.viewMode}
          availability={availability}
          onClose={() => setState((s) => ({ ...s, panelOpen: false }))}
          onEnterStorm={approachThenEnter}
          onReturnGlobe={returnGlobe}
        />
        {state.viewMode === 'storm' && (
          <TimelineBar
            timeline={state.timeline}
            onChange={(partial) =>
              setState((s) => ({ ...s, timeline: { ...s.timeline, ...partial } }))
            }
            onReset={() =>
              setState((s) => ({
                ...s,
                timeline: { ...s.timeline, simTime: 0, playing: true },
              }))
            }
          />
        )}
      </>
    }>
      {state.viewMode === 'globe' ? (
        <GlobeView
          active
          requestFlyToStorm={flyStormToken}
          requestFlyHome={flyHomeToken}
          onEnterStorm={enterStorm}
        />
      ) : (
        <StormView
          active
          paused={!state.timeline.playing}
          lightingMode={state.lightingMode}
          layers={state.layers}
          cloudParams={state.cloudParams}
          flashFreq={state.flashFreq}
          simTime={state.timeline.simTime}
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
