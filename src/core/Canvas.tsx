import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { SupercellScene } from '../render/SupercellScene'
import { SupercellControls } from '../render/SupercellControls'
import { detectLowPower } from '../utils/perf'
import type { SimParams } from './types'

interface CanvasProps {
  paused: boolean
  params: SimParams
  demoFlashToken: number
}

export function Canvas({ paused, params, demoFlashToken }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SupercellScene | null>(null)
  const controlsRef = useRef<SupercellControls | null>(null)
  const rafRef = useRef<number | null>(null)
  const timeRef = useRef(0)

  useEffect(() => {
    if (!containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x0b1224)
    containerRef.current.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(55, width / height, 1, 2000)
    camera.position.set(320, 420, 680)
    camera.lookAt(0, 280, 0)

    const scene = new SupercellScene(detectLowPower())
    sceneRef.current = scene

    const controls = new SupercellControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.setHeroPreset()

    const resize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', resize)

    const onReset = () => {
      controlsRef.current?.reset()
    }
    window.addEventListener('stormverse:reset-camera', onReset)

    const clock = new THREE.Clock()
    clock.start()

    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.0333)
      const t = clock.getElapsedTime()
      timeRef.current = t

      controlsRef.current?.update(dt)
      sceneRef.current?.update(dt, t, paused, params)
      sceneRef.current?.render(renderer, camera)

      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('stormverse:reset-camera', onReset)
      controlsRef.current?.dispose()
      sceneRef.current?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      controlsRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setParams(params)
  }, [params])

  useEffect(() => {
    if (demoFlashToken === 0) return
    sceneRef.current?.triggerLightning()
  }, [demoFlashToken])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
