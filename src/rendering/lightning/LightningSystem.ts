import * as THREE from 'three'
import type { LightningObservation } from '../../weather/types/observations'

/**
 * Visual lightning renderer. Consumes LightningObservation-shaped events
 * without depending on a specific weather provider.
 */
export class LightningSystem {
  group = new THREE.Group()
  private flashLight: THREE.PointLight
  private bolts: THREE.Line[] = []
  private active = false
  private timer = 0
  private duration = 0.16
  private intensity = 0
  private enabled = true
  private reducedFlash = false
  private flashPos = new THREE.Vector3(40, 420, -20)

  constructor() {
    this.flashLight = new THREE.PointLight(0xdce7ff, 0, 2400, 2)
    this.flashLight.position.copy(this.flashPos)
    this.group.add(this.flashLight)
  }

  setEnabled(v: boolean) {
    this.enabled = v
    if (!v) {
      this.active = false
      this.flashLight.intensity = 0
      this.clearBolts()
    }
  }

  setReducedFlash(v: boolean) {
    this.reducedFlash = v
  }

  /** Trigger from a typed observation or synthetic demo. */
  triggerFromEvent(event?: Pick<LightningObservation, 'longitude' | 'latitude' | 'altitudeM'>) {
    if (!this.enabled) return
    // Map geo offset into local storm space (prototype scene is local ENU-ish)
    if (event) {
      const x = (event.longitude - 149.12) * 8000
      const z = (event.latitude + 32.45) * -8000
      const y = event.altitudeM ?? 4500
      this.flashPos.set(
        THREE.MathUtils.clamp(x, -120, 120),
        THREE.MathUtils.clamp(y * 0.08, 280, 520),
        THREE.MathUtils.clamp(z, -120, 120),
      )
    } else {
      this.flashPos.set(
        (Math.random() - 0.5) * 100,
        360 + Math.random() * 160,
        (Math.random() - 0.5) * 100,
      )
    }
    this.trigger()
  }

  trigger() {
    if (!this.enabled) return
    this.active = true
    this.timer = 0
    this.duration = this.reducedFlash ? 0.08 : 0.12 + Math.random() * 0.14
    this.intensity = this.reducedFlash ? 3.5 + Math.random() * 2 : 9 + Math.random() * 12
    this.flashLight.position.copy(this.flashPos)
    this.flashLight.intensity = this.intensity
    this.spawnBolts()
  }

  getIllumination(): { position: THREE.Vector3; intensity: number } {
    return {
      position: this.flashLight.position,
      intensity: this.flashLight.intensity,
    }
  }

  private spawnBolts() {
    this.clearBolts()
    if (this.reducedFlash) return
    const count = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const points: THREE.Vector3[] = []
      const start = this.flashPos
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 30, (Math.random() - 0.5) * 40))
      points.push(start)
      let cur = start.clone()
      const segs = 6 + Math.floor(Math.random() * 5)
      const cg = Math.random() > 0.45
      for (let s = 0; s < segs; s++) {
        cur = cur.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 55,
            cg ? -(55 + Math.random() * 50) : (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 55,
          ),
        )
        points.push(cur)
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({
        color: 0xf5f8ff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geo, mat)
      this.group.add(line)
      this.bolts.push(line)
    }
  }

  private clearBolts() {
    this.bolts.forEach((b) => {
      this.group.remove(b)
      b.geometry.dispose()
      if (Array.isArray(b.material)) b.material.forEach((m) => m.dispose())
      else b.material.dispose()
    })
    this.bolts = []
  }

  update(dt: number) {
    if (!this.active) {
      this.flashLight.intensity *= 0.86
      if (this.flashLight.intensity < 0.02) this.flashLight.intensity = 0
      this.bolts.forEach((b) => {
        const mat = b.material as THREE.LineBasicMaterial
        mat.opacity *= 0.78
      })
      return
    }
    this.timer += dt
    const t = this.timer / this.duration
    const flicker = this.reducedFlash ? 0.85 : 0.65 + Math.random() * 0.35
    this.flashLight.intensity = this.intensity * (1 - t) * flicker
    this.bolts.forEach((b) => {
      const mat = b.material as THREE.LineBasicMaterial
      mat.opacity = (1 - t) * 0.9
    })
    if (this.timer >= this.duration) {
      this.active = false
      this.clearBolts()
    }
  }

  dispose() {
    this.clearBolts()
    this.group.remove(this.flashLight)
    this.flashLight.dispose()
  }
}
