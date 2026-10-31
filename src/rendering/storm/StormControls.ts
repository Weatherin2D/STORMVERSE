import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type StormCameraPreset =
  | 'overview'
  | 'cloudTop'
  | 'sideProfile'
  | 'ground'
  | 'radar'

interface Preset {
  position: THREE.Vector3
  target: THREE.Vector3
}

const PRESETS: Record<StormCameraPreset, Preset> = {
  overview: {
    position: new THREE.Vector3(320, 420, 680),
    target: new THREE.Vector3(0, 280, 0),
  },
  cloudTop: {
    position: new THREE.Vector3(80, 720, 220),
    target: new THREE.Vector3(20, 480, 0),
  },
  sideProfile: {
    position: new THREE.Vector3(780, 260, 40),
    target: new THREE.Vector3(0, 300, 0),
  },
  ground: {
    position: new THREE.Vector3(180, 35, 420),
    target: new THREE.Vector3(0, 220, 0),
  },
  radar: {
    position: new THREE.Vector3(-420, 180, 520),
    target: new THREE.Vector3(0, 260, 0),
  },
}

export class StormControls {
  controls: OrbitControls
  private camera: THREE.PerspectiveCamera
  private anim: {
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    t: number
    dur: number
  } | null = null

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.controls = new OrbitControls(camera, domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 80
    this.controls.maxDistance = 1100
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI / 2.05
    this.applyPreset('overview', 0)
  }

  applyPreset(name: StormCameraPreset, duration = 1.1) {
    const p = PRESETS[name]
    if (duration <= 0) {
      this.camera.position.copy(p.position)
      this.controls.target.copy(p.target)
      this.controls.update()
      this.anim = null
      return
    }
    this.anim = {
      fromPos: this.camera.position.clone(),
      toPos: p.position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: p.target.clone(),
      t: 0,
      dur: duration,
    }
  }

  reset() {
    this.applyPreset('overview')
  }

  update(dt: number) {
    if (this.anim) {
      this.anim.t += dt
      const k = Math.min(1, this.anim.t / this.anim.dur)
      const e = 1 - Math.pow(1 - k, 3)
      this.camera.position.lerpVectors(this.anim.fromPos, this.anim.toPos, e)
      this.controls.target.lerpVectors(this.anim.fromTarget, this.anim.toTarget, e)
      if (k >= 1) this.anim = null
    }
    this.controls.update()
  }

  dispose() {
    this.controls.dispose()
  }
}
