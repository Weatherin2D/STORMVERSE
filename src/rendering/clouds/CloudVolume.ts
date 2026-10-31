import * as THREE from 'three'
import { CLOUD_DEFAULTS } from '../../config/app'
import type { AtmosphereState } from '../atmosphere/lighting'
import { cloudFragmentShader, cloudVertexShader } from './shaders'

export interface CloudParams {
  density: number
  verticalDevelopment: number
  horizontalScale: number
  anvilExtent: number
  edgeSoftness: number
  turbulence: number
  fineDetail: number
  cloudTopStructure: number
  lightingResponse: number
  seed: number
}

export class CloudVolume {
  group = new THREE.Group()
  private mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private boxMin: THREE.Vector3
  private boxMax: THREE.Vector3
  private params: CloudParams
  private visibleFlag = true

  constructor(lowPower: boolean) {
    this.params = { ...CLOUD_DEFAULTS }
    const width = 520 * this.params.horizontalScale
    const height = 480
    const depth = 480 * this.params.horizontalScale
    this.boxMin = new THREE.Vector3(-width / 2, 40, -depth / 2)
    this.boxMax = new THREE.Vector3(width / 2, 40 + height, depth / 2)

    const geo = new THREE.BoxGeometry(width, height, depth)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uDensity: { value: this.params.density },
        uVertical: { value: this.params.verticalDevelopment },
        uAnvil: { value: this.params.anvilExtent },
        uTurb: { value: this.params.turbulence },
        uFine: { value: this.params.fineDetail },
        uEdge: { value: this.params.edgeSoftness },
        uLightResp: { value: this.params.lightingResponse },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uSunColor: { value: new THREE.Color(0xfff2d6) },
        uSkyColor: { value: new THREE.Color(0x6a8bb8) },
        uCoreColor: { value: new THREE.Color(0x4a5568) },
        uHighlight: { value: new THREE.Color(0xf7fbff) },
        uLightningPos: { value: new THREE.Vector3(0, 400, 0) },
        uLightningIntensity: { value: 0 },
        uNightFactor: { value: 0 },
        uBoxMin: { value: this.boxMin.clone() },
        uBoxMax: { value: this.boxMax.clone() },
        uSteps: { value: lowPower ? 40 : 72 },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
    })

    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.position.set(0, 40 + height / 2, 0)
    this.mesh.frustumCulled = false
    this.group.add(this.mesh)

    // Soft haze shell
    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x8aa0b8,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    )
    haze.position.y = 280
    haze.name = 'haze'
    this.group.add(haze)
  }

  setParams(partial: Partial<CloudParams>) {
    this.params = { ...this.params, ...partial }
    const u = this.material.uniforms
    u.uDensity.value = this.params.density
    u.uVertical.value = this.params.verticalDevelopment
    u.uAnvil.value = this.params.anvilExtent
    u.uTurb.value = this.params.turbulence
    u.uFine.value = this.params.fineDetail
    u.uEdge.value = this.params.edgeSoftness
    u.uLightResp.value = this.params.lightingResponse
  }

  setVisible(v: boolean) {
    this.visibleFlag = v
    this.group.visible = v
  }

  applyAtmosphere(atm: AtmosphereState) {
    const u = this.material.uniforms
    u.uSunDir.value.copy(atm.sunDirection)
    u.uSunColor.value.copy(atm.cloudLightColor)
    u.uSkyColor.value.copy(atm.skyColor)
    u.uCoreColor.value.copy(atm.cloudCoreColor)
    u.uHighlight.value.copy(atm.cloudHighlightColor)
    u.uNightFactor.value = atm.mode === 'night' ? 1 : atm.mode === 'sunset' ? 0.35 : 0

    const haze = this.group.getObjectByName('haze') as THREE.Mesh | undefined
    if (haze && haze.material instanceof THREE.MeshBasicMaterial) {
      haze.material.color.copy(atm.fogColor)
      haze.material.opacity = atm.mode === 'night' ? 0.03 : 0.06
    }
  }

  setLightning(pos: THREE.Vector3, intensity: number) {
    this.material.uniforms.uLightningPos.value.copy(pos)
    this.material.uniforms.uLightningIntensity.value = intensity
  }

  update(time: number) {
    if (!this.visibleFlag) return
    this.material.uniforms.uTime.value = time
    // Keep box uniforms in world space
    this.mesh.updateMatrixWorld(true)
    const pos = this.mesh.position
    const geo = this.mesh.geometry as THREE.BoxGeometry
    const params = geo.parameters
    this.boxMin.set(
      pos.x - params.width / 2,
      pos.y - params.height / 2,
      pos.z - params.depth / 2,
    )
    this.boxMax.set(
      pos.x + params.width / 2,
      pos.y + params.height / 2,
      pos.z + params.depth / 2,
    )
    this.material.uniforms.uBoxMin.value.copy(this.boxMin)
    this.material.uniforms.uBoxMax.value.copy(this.boxMax)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj !== this.mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else obj.material.dispose()
      }
    })
    this.group.clear()
  }
}
