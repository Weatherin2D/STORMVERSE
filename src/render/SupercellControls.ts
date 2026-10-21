import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CameraPreset } from '../core/types'

export class SupercellControls {
  controls: OrbitControls
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private hero: CameraPreset = {
    position: [320, 420, 680],
    target: [0, 280, 0],
  }

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.domElement = domElement
    this.controls = new OrbitControls(this.camera, this.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 220
    this.controls.maxDistance = 980
    this.controls.minPolarAngle = 0.25
    this.controls.maxPolarAngle = Math.PI / 2.02
    this.controls.target.set(this.hero.target[0], this.hero.target[1], this.hero.target[2])
    this.controls.update()
  }

  setHeroPreset() {
    this.camera.position.set(this.hero.position[0], this.hero.position[1], this.hero.position[2])
    this.controls.target.set(this.hero.target[0], this.hero.target[1], this.hero.target[2])
    this.controls.update()
  }

  reset() {
    this.setHeroPreset()
  }

  update(dt: number) {
    void dt
    this.controls.update()
  }

  dispose() {
    this.controls.dispose()
  }
}

