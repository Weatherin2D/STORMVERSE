import * as THREE from 'three'

/**
 * Visual precipitation only — not measured rainfall intensity.
 * Provenance: synthetic / procedural demonstration.
 */
export class RainShafts {
  group = new THREE.Group()
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private enabled = true

  constructor() {
    const geo = new THREE.CylinderGeometry(28, 48, 220, 16, 1, true)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.28 },
        uColor: { value: new THREE.Color(0x8aa0b8) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        void main() {
          float streaks = fract(vUv.y * 28.0 - uTime * 2.4);
          float shaft = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float fall = smoothstep(0.0, 0.2, streaks) * (1.0 - smoothstep(0.4, 1.0, streaks));
          float alpha = shaft * fall * uOpacity * (1.0 - vUv.y * 0.35);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.position.set(10, 130, -5)
    this.group.add(this.mesh)

    // Secondary flanking shaft
    const mesh2 = this.mesh.clone()
    mesh2.material = this.material.clone()
    mesh2.position.set(-35, 120, 25)
    mesh2.scale.set(0.7, 0.9, 0.7)
    this.group.add(mesh2)
  }

  setEnabled(v: boolean) {
    this.enabled = v
    this.group.visible = v
  }

  setNight(night: boolean) {
    this.material.uniforms.uColor.value.set(night ? 0x3a4558 : 0x8aa0b8)
    this.material.uniforms.uOpacity.value = night ? 0.16 : 0.28
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial && obj !== this.mesh) {
        obj.material.uniforms.uColor.value.copy(this.material.uniforms.uColor.value)
        obj.material.uniforms.uOpacity.value = this.material.uniforms.uOpacity.value
      }
    })
  }

  update(time: number) {
    if (!this.enabled) return
    this.material.uniforms.uTime.value = time
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
        obj.material.uniforms.uTime.value = time
      }
    })
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else obj.material.dispose()
      }
    })
    this.group.clear()
  }
}
