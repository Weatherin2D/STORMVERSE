import * as THREE from 'three'

export class Ground {
  mesh: THREE.Mesh

  constructor() {
    const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x060910,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = 0
  }

  dispose() {
    this.mesh.geometry.dispose()
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose())
    } else {
      this.mesh.material.dispose()
    }
  }
}

