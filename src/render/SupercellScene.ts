import * as THREE from 'three'
import { VolumetricClouds } from './VolumetricClouds'
import { LightningFlash } from './LightningFlash'
import { Ground } from './Ground'
import type { SimParams } from '../core/types'

export class SupercellScene {
  private scene = new THREE.Scene()
  private clouds: VolumetricClouds
  private lightning: LightningFlash
  private ground: Ground
  private ambient = new THREE.AmbientLight(0x8a9bff, 0.18)
  private hemi = new THREE.HemisphereLight(0x9db4ff, 0x05070f, 0.24)
  private dir = new THREE.DirectionalLight(0x7f9bff, 0.22)
  private stormLight = new THREE.PointLight(0xb9d4ff, 0, 1600)
  private flashTimer = 0
  private flashInterval = 4.2

  constructor(lowPower: boolean) {
    this.scene.fog = new THREE.FogExp2(0x050810, 0.00022)
    this.dir.position.set(420, 560, 320)
    this.dir.castShadow = false
    this.stormLight.position.set(60, 520, -40)
    this.scene.add(this.ambient)
    this.scene.add(this.hemi)
    this.scene.add(this.dir)
    this.scene.add(this.stormLight)
    this.ground = new Ground()
    this.scene.add(this.ground.mesh)
    this.clouds = new VolumetricClouds(lowPower)
    this.scene.add(this.clouds.group)
    this.lightning = new LightningFlash(this.scene, this.stormLight)
  }

  setParams(p: SimParams) {
    void p
    this.clouds.setParams(p)
    this.flashInterval = THREE.MathUtils.lerp(6.6, 2.6, p.flashFreq)
  }

  triggerLightning() {
    this.lightning.trigger()
  }

  update(dt: number, t: number, paused: boolean, p: SimParams) {
    this.setParams(p)
    if (!paused) {
      this.clouds.update(dt, t, p)
      this.flashTimer += dt
      if (this.flashTimer > this.flashInterval) {
        this.flashTimer = 0
        if (Math.random() < 0.6 + p.flashFreq * 0.4) {
          this.lightning.trigger()
        }
      }
    }
    this.lightning.update(dt)
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    renderer.render(this.scene, camera)
  }

  dispose() {
    this.clouds.dispose()
    this.ground.dispose()
    this.lightning.dispose()
  }
}
