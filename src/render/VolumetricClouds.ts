import * as THREE from 'three'
import type { SimParams } from '../core/types'

interface Puff {
  mesh: THREE.Mesh
  basePos: THREE.Vector3
  offset: number
  scale: THREE.Vector3
  rotSpeed: number
}

export class VolumetricClouds {
  group = new THREE.Group()
  private puffs: Puff[] = []
  private material: THREE.ShaderMaterial
  private lowPower: boolean
  private time = 0
  private drift = 0.24
  private detail = 0.7

  constructor(lowPower: boolean) {
    this.lowPower = lowPower
    const count = lowPower ? 22 : 38
    const puffGeo = new THREE.IcosahedronGeometry(1, lowPower ? 1 : 2)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(0x9db8ff) },
        uCore: { value: new THREE.Color(0x1b2238) },
        uHighlight: { value: new THREE.Color(0xbfd3ff) },
        uOpacity: { value: 0.9 },
        uDetail: { value: 0.7 },
      },
      vertexShader: /* glsl */ 
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uDetail;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec3 pos = position;
          float wave = sin(uTime * 0.12 + position.y * 0.01) * (0.08 + uDetail * 0.12);
          pos += normal * wave;
          vPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      ,
      fragmentShader: /* glsl */ 
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform vec3 uLight;
        uniform vec3 uCore;
        uniform vec3 uHighlight;
        uniform float uOpacity;
        uniform float uDetail;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vPos);
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 2.2);
          float shade = smoothstep(-0.2, 1.0, dot(vNormal, normalize(uLight)));
          vec3 col = mix(uCore, uHighlight, shade + fresnel * 0.6);
          float edge = smoothstep(0.0, 0.8, fresnel + (1.0 - shade) * 0.4);
          col = mix(col, uHighlight * 1.2, edge * uDetail);
          float alpha = (0.16 + fresnel * 0.42 + edge * 0.28) * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      ,
    })

    const towerHeights = [280, 340, 420, 500]
    for (let i = 0; i < count; i++) {
      const t = i / count
      const ring = Math.floor(t * 4)
      const r = 38 + ring * 22 + Math.random() * 18
      const ang = t * Math.PI * 6 + Math.random() * 0.6
      const baseY = 120 + ring * 90 + (i % 3) * 28
      const x = Math.cos(ang) * r + (Math.random() - 0.5) * 14
      const z = Math.sin(ang) * r + (Math.random() - 0.5) * 14
      const y = baseY + towerHeights[ring % towerHeights.length] * 0.12
      const s = 52 + ring * 34 + Math.random() * 26
      const mesh = new THREE.Mesh(puffGeo, this.material.clone())
      mesh.position.set(x, y, z)
      mesh.scale.set(s, s * (0.6 + Math.random() * 0.28), s)
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      this.puffs.push({
        mesh,
        basePos: mesh.position.clone(),
        offset: Math.random() * Math.PI * 2,
        scale: mesh.scale.clone(),
        rotSpeed: (Math.random() - 0.5) * 0.0018,
      })
      this.group.add(mesh)
    }

    // anvil
    for (let i = 0; i < (lowPower ? 10 : 16); i++) {
      const ang = (i / (lowPower ? 10 : 16)) * Math.PI * 2
      const r = 90 + Math.random() * 110
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const y = 460 + Math.random() * 40
      const s = 64 + Math.random() * 38
      const mesh = new THREE.Mesh(puffGeo, this.material.clone())
      mesh.position.set(x, y, z)
      mesh.scale.set(s * 1.8, s * 0.32, s * 1.8)
      mesh.rotation.y = Math.random() * Math.PI
      this.puffs.push({
        mesh,
        basePos: mesh.position.clone(),
        offset: Math.random() * Math.PI * 2,
        scale: mesh.scale.clone(),
        rotSpeed: (Math.random() - 0.5) * 0.0012,
      })
      this.group.add(mesh)
    }

    // core
    for (let i = 0; i < (lowPower ? 6 : 10); i) {
      const x = (Math.random() - 0.5) * 60
      const z = (Math.random() - 0.5) * 60
      const y = 220 + Math.random() * 160
      const s = 58 + Math.random() * 34
      const mesh = new THREE.Mesh(puffGeo, this.material.clone())
      mesh.position.set(x, y, z)
      mesh.scale.set(s, s * 0.7, s)
      this.puffs.push({
        mesh,
        basePos: mesh.position.clone(),
        offset: Math.random() * Math.PI * 2,
        scale: mesh.scale.clone(),
        rotSpeed: (Math.random() - 0.5) * 0.0016,
      })
      this.group.add(mesh)
    }
  }

  setParams(p: SimParams) {
    this.drift = p.windDrift
    this.detail = p.cloudDetail
  }

  update(dt: number, t: number, p: SimParams) {
    this.time += dt
    this.drift = p.windDrift
    this.detail = p.cloudDetail
    const driftSpeed = 8 + this.drift * 18
    this.puffs.forEach((puff, idx) => {
      const mat = puff.mesh.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = t
      mat.uniforms.uDetail.value = this.detail
      const breathe = 1 + Math.sin(t * 0.14 + puff.offset) * (0.008 + this.detail * 0.012)
      puff.mesh.scale.copy(puff.scale).multiplyScalar(breathe)
      puff.mesh.rotation.y += puff.rotSpeed
      puff.mesh.position.x = puff.basePos.x + Math.sin(t * 0.08 + idx * 0.37) * driftSpeed * (0.4 + idx % 5)
      puff.mesh.position.z = puff.basePos.z + Math.cos(t * 0.06 + idx * 0.29) * driftSpeed * 0.32
      puff.mesh.position.y = puff.basePos.y + Math.sin(t * 0.1 + puff.offset) * (2.2 + this.detail * 3.6)
    })
  }

  dispose() {
    const seenGeo = new Set<THREE.BufferGeometry>()
    const seenMat = new Set<THREE.Material>()
    this.puffs.forEach((puff) => {
      if (!seenGeo.has(puff.mesh.geometry)) {
        puff.mesh.geometry.dispose()
        seenGeo.add(puff.mesh.geometry)
      }
      const mat = puff.mesh.material
      if (!Array.isArray(mat)) {
        if (!seenMat.has(mat)) {
          mat.dispose()
          seenMat.add(mat)
        }
      } else {
        mat.forEach((m) => {
          if (!seenMat.has(m)) {
            m.dispose()
            seenMat.add(m)
          }
        })
      }
    })
    this.group.clear()
  }
}

