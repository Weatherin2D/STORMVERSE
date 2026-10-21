import * as THREE from 'three'

export class LightningFlash {
  private scene: THREE.Scene
  private flashLight = new THREE.PointLight(0xdce7ff, 0, 2200)
  private bolts: THREE.Line[] = []
  private active = false
  private timer = 0
  private duration = 0.16
  private intensity = 0

  constructor(scene: THREE.Scene, _stormLight: THREE.PointLight) {
    this.scene = scene
    this.flashLight.position.set(40, 620, -20)
    this.scene.add(this.flashLight)
  }

  trigger() {
    this.active = true
    this.timer = 0
    this.duration = 0.12 + Math.random() * 0.12
    this.intensity = 8 + Math.random() * 10
    this.flashLight.intensity = this.intensity
    this.spawnBolts()
  }

  private spawnBolts() {
    this.bolts.forEach((b) => {
      this.scene.remove(b)
      b.geometry.dispose()
      if (Array.isArray(b.material)) b.material.forEach((m) => m.dispose())
      else b.material.dispose()
    })
    this.bolts = []
    const count = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const points = []
      const start = new THREE.Vector3((Math.random() - 0.5) * 80, 560 + Math.random() * 40, (Math.random() - 0.5) * 80)
      points.push(start)
      let cur = start.clone()
      const segs = 6 + Math.floor(Math.random() * 5)
      for (let s = 0; s < segs; s++) {
        cur = cur.clone().add(
          new THREE.Vector3((Math.random() - 0.5) * 60, - (60 + Math.random() * 40), (Math.random() - 0.5) * 60),
        )
        points.push(cur)
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({
        color: 0xf5f8ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      })
      const line = new THREE.Line(geo, mat)
      this.scene.add(line)
      this.bolts.push(line)
    }
  }

  update(dt: number) {
    if (!this.active) {
      this.flashLight.intensity *= 0.88
      if (this.flashLight.intensity < 0.01) this.flashLight.intensity = 0
      this.bolts.forEach((b) => {
        const mat = b.material as THREE.LineBasicMaterial
        mat.opacity *= 0.8
      })
      return
    }
    this.timer += dt
    const t = this.timer / this.duration
    this.flashLight.intensity = this.intensity * (1 - t) * (0.7 + Math.random() * 0.3)
    this.bolts.forEach((b) => {
      const mat = b.material as THREE.LineBasicMaterial
      mat.opacity = (1 - t) * 0.9
    })
    if (this.timer >= this.duration) {
      this.active = false
      this.bolts.forEach((b) => {
        const mat = b.material as THREE.LineBasicMaterial
        mat.opacity = 0
      })
    }
  }

  dispose() {
    this.scene.remove(this.flashLight)
    this.bolts.forEach((b) => {
      this.scene.remove(b)
      b.geometry.dispose()
      if (Array.isArray(b.material)) b.material.forEach((m) => m.dispose())
      else b.material.dispose()
    })
    this.bolts = []
  }
}
