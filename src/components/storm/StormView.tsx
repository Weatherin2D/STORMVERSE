import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { StormScene } from '../../rendering/storm/StormScene'
import { StormControls, type StormCameraPreset } from '../../rendering/storm/StormControls'
import { detectLowPower } from '../../utils/perf'
import type { CloudParams } from '../../rendering/clouds/CloudVolume'
import type { LightingMode } from '../../rendering/atmosphere/lighting'
import type { LayerState } from '../../lib/appState'
import type { LightningObservation } from '../../weather/types/observations'

interface StormViewProps {
  active: boolean
  paused: boolean
  lightingMode: LightingMode
  layers: LayerState
  cloudParams: CloudParams
  flashFreq: number
  simTime: number
  reducedFlash: boolean
  cameraPreset: StormCameraPreset
  presetToken: number
  lightningEvent: LightningObservation | null
  lightningToken: number
}

export function StormView({
  paused,
  lightingMode,
  layers,
  cloudParams,
  flashFreq,
  simTime,
  reducedFlash,
  cameraPreset,
  presetToken,
  lightningEvent,
  lightningToken,
}: StormViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<StormScene | null>(null)
  const controlsRef = useRef<StormControls | null>(null)
  const rafRef = useRef<number | null>(null)
  const pausedRef = useRef(paused)
  const flashFreqRef = useRef(flashFreq)
  pausedRef.current = paused
  flashFreqRef.current = flashFreq

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(55, width / height, 1, 4000)
    const scene = new StormScene(detectLowPower())
    sceneRef.current = scene
    const controls = new StormControls(camera, renderer.domElement)
    controlsRef.current = controls

    const resize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', resize)

    const clock = new THREE.Clock()
    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.033)
      const t = clock.getElapsedTime()
      controlsRef.current?.update(dt)
      sceneRef.current?.update(dt, t, pausedRef.current, flashFreqRef.current)
      sceneRef.current?.render(renderer, camera)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      controlsRef.current?.dispose()
      sceneRef.current?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      controlsRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setLightingMode(lightingMode)
  }, [lightingMode])

  useEffect(() => {
    sceneRef.current?.setLayers(layers)
  }, [layers])

  useEffect(() => {
    sceneRef.current?.setCloudParams(cloudParams)
  }, [cloudParams])

  useEffect(() => {
    sceneRef.current?.setReducedFlash(reducedFlash)
  }, [reducedFlash])

  useEffect(() => {
    sceneRef.current?.setSimTime(simTime)
  }, [simTime])

  useEffect(() => {
    if (presetToken === 0) return
    controlsRef.current?.applyPreset(cameraPreset)
  }, [presetToken, cameraPreset])

  useEffect(() => {
    if (lightningToken === 0) return
    sceneRef.current?.triggerLightning(lightningEvent ?? undefined)
  }, [lightningToken, lightningEvent])

  return <div ref={containerRef} className="viewport-layer storm-layer" />
}
