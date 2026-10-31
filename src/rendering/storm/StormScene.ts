import * as THREE from 'three'
import type { CloudParams } from '../clouds/CloudVolume'
import { CloudVolume } from '../clouds/CloudVolume'
import { LightningSystem } from '../lightning/LightningSystem'
import { RainShafts } from '../precipitation/RainShafts'
import { atmosphereFor, type AtmosphereState, type LightingMode } from '../atmosphere/lighting'
import type { LightningObservation } from '../../weather/types/observations'

export interface StormLayerState {
  clouds: boolean
  lightning: boolean
  precipitation: boolean
}

export class StormScene {
  private scene = new THREE.Scene()
  private clouds: CloudVolume
  private lightning: LightningSystem
  private rain: RainShafts
  private ambient: THREE.AmbientLight
  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight
  private ground: THREE.Mesh
  private atmosphere: AtmosphereState
  private flashTimer = 0
  private flashInterval = 4.2
  private autoLightning = true
  private simTime = 0

  constructor(lowPower: boolean) {
    this.atmosphere = atmosphereFor('day')
    this.scene.background = this.atmosphere.skyColor.clone()
    this.scene.fog = new THREE.FogExp2(this.atmosphere.fogColor.getHex(), 0.00035)

    this.ambient = new THREE.AmbientLight(0xffffff, this.atmosphere.ambientIntensity)
    this.hemi = new THREE.HemisphereLight(0x9db4ff, 0x1a1208, this.atmosphere.hemiIntensity)
    this.dir = new THREE.DirectionalLight(0xfff2d6, this.atmosphere.dirIntensity)
    this.dir.position.copy(this.atmosphere.sunDirection).multiplyScalar(800)
    this.scene.add(this.ambient, this.hemi, this.dir)

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e18,
      roughness: 0.95,
      metalness: 0.0,
    })
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1800, 64), groundMat)
    this.ground.rotation.x = -Math.PI / 2
    this.scene.add(this.ground)

    // Distant terrain hint
    const hills = new THREE.Mesh(
      new THREE.CylinderGeometry(900, 1100, 40, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x121610, flatShading: true }),
    )
    hills.position.y = -5
    this.scene.add(hills)

    this.clouds = new CloudVolume(lowPower)
    this.scene.add(this.clouds.group)
    this.lightning = new LightningSystem()
    this.scene.add(this.lightning.group)
    this.rain = new RainShafts()
    this.scene.add(this.rain.group)

    this.applyAtmosphere()
  }

  setLightingMode(mode: LightingMode) {
    this.atmosphere = atmosphereFor(mode)
    this.applyAtmosphere()
  }

  private applyAtmosphere() {
    const a = this.atmosphere
    this.scene.background = a.skyColor.clone()
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(a.fogColor)
      this.scene.fog.density = a.mode === 'night' ? 0.00055 : 0.00032
    }
    this.ambient.intensity = a.ambientIntensity
    this.hemi.intensity = a.hemiIntensity
    this.dir.intensity = a.dirIntensity
    this.dir.color.copy(a.cloudLightColor)
    this.dir.position.copy(a.sunDirection).multiplyScalar(800)
    this.clouds.applyAtmosphere(a)
    this.rain.setNight(a.mode === 'night')
    if (this.ground.material instanceof THREE.MeshStandardMaterial) {
      this.ground.material.color.set(a.mode === 'night' ? 0x050608 : 0x1a1e18)
    }
  }

  setLayers(layers: StormLayerState) {
    this.clouds.setVisible(layers.clouds)
    this.lightning.setEnabled(layers.lightning)
    this.rain.setEnabled(layers.precipitation)
    this.autoLightning = layers.lightning
  }

  setCloudParams(p: Partial<CloudParams>) {
    this.clouds.setParams(p)
  }

  setReducedFlash(v: boolean) {
    this.lightning.setReducedFlash(v)
  }

  setSimTime(simSec: number) {
    this.simTime = simSec
  }

  triggerLightning(event?: LightningObservation) {
    this.lightning.triggerFromEvent(event)
  }

  getExposure(): number {
    return this.atmosphere.exposure
  }

  update(dt: number, wallTime: number, paused: boolean, flashFreq: number) {
    if (!paused) {
      this.clouds.update(wallTime + this.simTime * 0.05)
      this.rain.update(wallTime)
      this.flashInterval = THREE.MathUtils.lerp(7.2, 2.2, flashFreq)
      this.flashTimer += dt
      if (this.autoLightning && this.flashTimer > this.flashInterval) {
        this.flashTimer = 0
        if (Math.random() < 0.55 + flashFreq * 0.4) {
          this.lightning.trigger()
        }
      }
    }
    this.lightning.update(dt)
    const illum = this.lightning.getIllumination()
    this.clouds.setLightning(illum.position, illum.intensity)
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    renderer.toneMappingExposure = this.atmosphere.exposure
    renderer.render(this.scene, camera)
  }

  dispose() {
    this.clouds.dispose()
    this.lightning.dispose()
    this.rain.dispose()
    this.ground.geometry.dispose()
    if (this.ground.material instanceof THREE.Material) this.ground.material.dispose()
    this.scene.clear()
  }
}
