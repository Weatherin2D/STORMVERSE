import {
  Appearance,
  BlendingState,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  GeometryInstance,
  LabelStyle,
  Matrix4,
  Primitive,
  Transforms,
  VertexFormat,
  VerticalOrigin,
  type Viewer,
} from 'cesium'
import type { CloudParams } from '../clouds/CloudVolume'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'

const BASE_HEIGHT = 900

/** Horizontal/vertical extents in metres for the ray-marched ENU box. */
function boxExtents(params: CloudParams): { width: number; depth: number; height: number } {
  const width = 28_000 * params.horizontalScale * (0.85 + params.anvilExtent * 0.35)
  const depth = 24_000 * params.horizontalScale
  const height = 6_000 + params.verticalDevelopment * 12_000
  return { width, depth, height }
}

function volumeVertexShader(): string {
  return /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in float batchId;
out vec3 v_positionWC;
void main() {
  vec4 p = czm_computePosition();
  v_positionWC = position3DHigh + position3DLow;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`
}

function mat4Glsl(m: Matrix4): string {
  const a = Matrix4.toArray(m)
  return `mat4(${a.map((v) => Number(v).toFixed(8)).join(', ')})`
}

function volumeFragmentShader(
  params: CloudParams,
  dims: { width: number; depth: number; height: number },
  inverseModel: Matrix4,
  tintRgb: [number, number, number],
): string {
  const density = params.density.toFixed(3)
  const vertical = params.verticalDevelopment.toFixed(3)
  const anvil = params.anvilExtent.toFixed(3)
  const turb = params.turbulence.toFixed(3)
  const hx = (dims.width * 0.5).toFixed(1)
  const hy = (dims.height * 0.5).toFixed(1)
  const hz = (dims.depth * 0.5).toFixed(1)
  const inv = mat4Glsl(inverseModel)
  const [tr, tg, tb] = tintRgb.map((c) => (c / 255).toFixed(3))

  return /* glsl */ `
in vec3 v_positionWC;
const vec3 u_half = vec3(${hx}, ${hy}, ${hz});
const float u_density = ${density};
const float u_vertical = ${vertical};
const float u_anvil = ${anvil};
const float u_turb = ${turb};
const mat4 u_inverseModel = ${inv};
const vec3 u_tint = vec3(${tr}, ${tg}, ${tb});

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.05 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
float stormDensity(vec3 local) {
  vec3 q = local / (u_half * 2.0);
  float h = q.y;
  float towerH = mix(0.12, 0.48, u_vertical);
  float towerR = 0.13 + (1.0 - u_vertical) * 0.05;
  float tower = 1.0 - smoothstep(towerR * 0.55, towerR * 1.25, length(q.xz));
  tower *= smoothstep(-0.48, -0.34, h) * (1.0 - smoothstep(towerH - 0.04, towerH + 0.14, h));
  float anvilY = towerH - 0.02;
  float anvilR = mix(0.2, 0.52, u_anvil);
  vec2 anvilC = q.xz - vec2(u_anvil * 0.1, 0.0);
  float anvilShape = 1.0 - smoothstep(anvilR * 0.3, anvilR, length(anvilC));
  anvilShape *= exp(-pow((h - anvilY) / 0.07, 2.0)) * mix(0.35, 1.0, u_anvil);
  float base = 1.0 - smoothstep(0.16, 0.4, length(q.xz));
  base *= smoothstep(-0.48, -0.4, h) * (1.0 - smoothstep(-0.28, -0.1, h));
  float body = max(max(tower, anvilShape), base * 0.8);
  vec3 wp = q * (2.8 + u_turb) + vec3(0.05, 0.02, -0.03);
  body *= mix(0.6, 1.15, fbm(wp));
  float thresh = mix(0.4, 0.2, u_density);
  return clamp(smoothstep(thresh, thresh + 0.18, body * u_density), 0.0, 1.0);
}
bool intersectBox(vec3 ro, vec3 rd, vec3 halfSize, out float t0, out float t1) {
  vec3 invRd = 1.0 / rd;
  vec3 tmin = (-halfSize - ro) * invRd;
  vec3 tmax = ( halfSize - ro) * invRd;
  vec3 t1v = min(tmin, tmax);
  vec3 t2v = max(tmin, tmax);
  t0 = max(max(t1v.x, t1v.y), t1v.z);
  t1 = min(min(t2v.x, t2v.y), t2v.z);
  return t1 >= max(t0, 0.0);
}
void main() {
  vec3 fragMC = (u_inverseModel * vec4(v_positionWC, 1.0)).xyz;
  vec3 camMC = (u_inverseModel * vec4(czm_viewerPositionWC, 1.0)).xyz;
  vec3 rd = normalize(fragMC - camMC);
  vec3 ro = camMC;
  float tEnter; float tExit;
  if (!intersectBox(ro, rd, u_half, tEnter, tExit)) discard;
  tEnter = max(tEnter, 0.0);
  const int STEPS = 40;
  float span = max(tExit - tEnter, 1.0);
  float stepLen = span / float(STEPS);
  vec3 pos = ro + rd * (tEnter + stepLen * 0.5);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 sunDir = normalize(vec3(0.35, 0.85, 0.25));
  for (int i = 0; i < STEPS; i++) {
    float d = stormDensity(pos);
    if (d > 0.02) {
      float light = 0.45 + 0.55 * clamp(dot(normalize(pos + vec3(0.0, u_half.y, 0.0)), sunDir), 0.0, 1.0);
      vec3 sampleCol = mix(u_tint * 0.45, mix(u_tint, vec3(0.92, 0.94, 0.96), 0.55), light);
      float hNorm = clamp((pos.y + u_half.y) / (u_half.y * 2.0), 0.0, 1.0);
      sampleCol *= mix(0.55, 1.05, hNorm);
      float a = d * 0.14;
      col += (1.0 - alpha) * a * sampleCol;
      alpha += (1.0 - alpha) * a;
      if (alpha > 0.95) break;
    }
    pos += rd * stepLen;
  }
  if (alpha < 0.015) discard;
  out_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
}
`
}

function parseAccent(css: string | undefined): { color: Color; rgb: [number, number, number] } {
  const fallback = '#e8c27a'
  const c = Color.fromCssColorString(css && css.startsWith('#') ? css : fallback)
  return {
    color: c,
    rgb: [
      Math.round(c.red * 255),
      Math.round(c.green * 255),
      Math.round(c.blue * 255),
    ],
  }
}

function idsFor(volumeId: string) {
  const safe = volumeId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return {
    primitive: `stormverse-vol-${safe}`,
    label: `stormverse-vol-label-${safe}`,
    core: `stormverse-vol-core-${safe}`,
    anvil: `stormverse-vol-anvil-${safe}`,
    precip: `stormverse-vol-precip-${safe}`,
  }
}

function poseKeyOf(lon: number, lat: number): string {
  return `${lon.toFixed(3)}|${lat.toFixed(3)}`
}

function paramsKeyOf(target: ReconstructionTarget, dims: { width: number; height: number }): string {
  return [
    dims.width.toFixed(0),
    dims.height.toFixed(0),
    target.cloudParams.density.toFixed(2),
    target.cloudParams.anvilExtent.toFixed(2),
    target.cloudParams.verticalDevelopment.toFixed(2),
    target.accentCss ?? '',
    target.primary ? '1' : '0',
    target.label,
  ].join('|')
}

interface SlotState {
  id: string
  primitive: Primitive | null
  lastParamsKey: string
  lastPoseKey: string
  rebuildTimer: ReturnType<typeof setTimeout> | null
  pending: ReconstructionTarget | null
}

export interface GeoregisteredVolumeHandle {
  setTarget: (target: ReconstructionTarget | null) => void
  setTargets: (targets: ReconstructionTarget[]) => void
  setVisible: (visible: boolean) => void
  destroy: () => void
}

/**
 * Places one or more procedural storm volumes on the Cesium globe for comparison.
 * Primary volume is ray-marched; others use accent-coloured schematic cues.
 */
export function createGeoregisteredVolume(viewer: Viewer): GeoregisteredVolumeHandle {
  let visible = true
  const slots = new Map<string, SlotState>()

  const clearSlot = (slot: SlotState) => {
    if (slot.rebuildTimer) clearTimeout(slot.rebuildTimer)
    if (slot.primitive && !slot.primitive.isDestroyed()) {
      viewer.scene.primitives.remove(slot.primitive)
    }
    const ids = idsFor(slot.id)
    for (const id of [ids.label, ids.core, ids.anvil, ids.precip]) {
      viewer.entities.removeById(id)
    }
  }

  const setVisible = (v: boolean) => {
    visible = v
    for (const slot of slots.values()) {
      if (slot.primitive) slot.primitive.show = v
      const ids = idsFor(slot.id)
      for (const id of [ids.label, ids.core, ids.anvil, ids.precip]) {
        const ent = viewer.entities.getById(id)
        if (ent) ent.show = v
      }
    }
    viewer.scene.requestRender()
  }

  const updateEntityPose = (target: ReconstructionTarget, dims: ReturnType<typeof boxExtents>) => {
    const ids = idsFor(target.id)
    const accent = parseAccent(target.accentCss)
    const coreHeight = Math.max(10_000, dims.height * 0.95)
    const { longitude: lon, latitude: lat } = target
    const core = viewer.entities.getById(ids.core)
    if (core) {
      core.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, BASE_HEIGHT + coreHeight * 0.5),
      )
    }
    const anvil = viewer.entities.getById(ids.anvil)
    if (anvil) {
      anvil.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(
          lon + 0.06 * target.cloudParams.anvilExtent,
          lat,
          BASE_HEIGHT + coreHeight + 1_500,
        ),
      )
    }
    const precip = viewer.entities.getById(ids.precip)
    if (precip) {
      precip.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, BASE_HEIGHT + 3_500),
      )
    }
    const labelEnt = viewer.entities.getById(ids.label)
    if (labelEnt) {
      labelEnt.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, BASE_HEIGHT + dims.height + 2_500),
      )
      if (labelEnt.label) {
        const prog =
          target.drivers.alongTrackProgress != null
            ? `\ntrack ${Math.round(target.drivers.alongTrackProgress * 100)}%`
            : ''
        const tag = target.primary ? 'primary · procedural' : 'compare · procedural'
        labelEnt.label.text = new ConstantProperty(`${target.label}\n${tag}${prog}`)
        labelEnt.label.fillColor = new ConstantProperty(accent.color)
      }
    }
  }

  const ensureEntities = (target: ReconstructionTarget, dims: ReturnType<typeof boxExtents>) => {
    const ids = idsFor(target.id)
    if (viewer.entities.getById(ids.core)) {
      updateEntityPose(target, dims)
      return
    }
    const accent = parseAccent(target.accentCss)
    const coreRadius = 7_500 + target.cloudParams.density * 4_500
    const coreHeight = Math.max(10_000, dims.height * 0.95)
    const fill = accent.color.withAlpha(target.primary ? 0.45 : 0.36)
    const outline = accent.color.withAlpha(0.7)

    viewer.entities.add({
      id: ids.core,
      position: Cartesian3.fromDegrees(
        target.longitude,
        target.latitude,
        BASE_HEIGHT + coreHeight * 0.5,
      ),
      ellipsoid: {
        radii: new Cartesian3(coreRadius, coreRadius * 0.88, coreHeight * 0.5),
        material: fill,
        outline: true,
        outlineColor: outline,
      },
      show: visible,
    })

    const anvilR = 16_000 + target.cloudParams.anvilExtent * 20_000
    viewer.entities.add({
      id: ids.anvil,
      position: Cartesian3.fromDegrees(
        target.longitude + 0.06 * target.cloudParams.anvilExtent,
        target.latitude,
        BASE_HEIGHT + coreHeight + 1_500,
      ),
      ellipsoid: {
        radii: new Cartesian3(anvilR, anvilR * 0.65, 2_200 + target.cloudParams.anvilExtent * 1_400),
        material: accent.color.withAlpha(0.32),
        outline: true,
        outlineColor: accent.color.withAlpha(0.5),
      },
      show: visible,
    })

    viewer.entities.add({
      id: ids.precip,
      position: Cartesian3.fromDegrees(target.longitude, target.latitude, BASE_HEIGHT + 3_500),
      cylinder: {
        length: 7_000,
        topRadius: 2_200,
        bottomRadius: 5_500,
        material: accent.color.withAlpha(0.28),
      },
      show: visible,
    })

    const prog =
      target.drivers.alongTrackProgress != null
        ? `\ntrack ${Math.round(target.drivers.alongTrackProgress * 100)}%`
        : ''
    const tag = target.primary ? 'primary · procedural' : 'compare · procedural'
    viewer.entities.add({
      id: ids.label,
      position: Cartesian3.fromDegrees(
        target.longitude,
        target.latitude,
        BASE_HEIGHT + dims.height + 2_500,
      ),
      label: {
        text: `${target.label}\n${tag}${prog}`,
        font: '12px "IBM Plex Sans", system-ui, sans-serif',
        fillColor: accent.color,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#0b1220').withAlpha(0.78),
        backgroundPadding: new Cartesian2(10, 6),
      },
      show: visible,
    })
  }

  const buildPrimitive = (slot: SlotState, target: ReconstructionTarget, dims: ReturnType<typeof boxExtents>) => {
    if (slot.primitive && !slot.primitive.isDestroyed()) {
      viewer.scene.primitives.remove(slot.primitive)
    }
    slot.primitive = null
    if (!target.primary) return

    const accent = parseAccent(target.accentCss)
    const origin = Cartesian3.fromDegrees(target.longitude, target.latitude, BASE_HEIGHT)
    const enu = Transforms.eastNorthUpToFixedFrame(origin)
    const swapYZ = new Matrix4(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
    const lift = Matrix4.fromTranslation(new Cartesian3(0, 0, dims.height * 0.5), new Matrix4())
    const local = Matrix4.multiply(lift, swapYZ, new Matrix4())
    const modelMatrix = Matrix4.multiply(enu, local, new Matrix4())
    const inverseModel = Matrix4.inverse(modelMatrix, new Matrix4())
    const geometry = BoxGeometry.fromDimensions({
      vertexFormat: VertexFormat.POSITION_ONLY,
      dimensions: new Cartesian3(dims.width, dims.height, dims.depth),
    })
    const appearance = new Appearance({
      translucent: true,
      closed: true,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
        cull: { enabled: true, face: 1028 },
      },
      vertexShaderSource: volumeVertexShader(),
      fragmentShaderSource: volumeFragmentShader(target.cloudParams, dims, inverseModel, accent.rgb),
    })
    slot.primitive = viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry,
          modelMatrix,
          id: idsFor(target.id).primitive,
        }),
        appearance,
        asynchronous: false,
        compressVertices: false,
        allowPicking: true,
        show: visible,
      }),
    )
  }

  const upsertTarget = (target: ReconstructionTarget) => {
    let slot = slots.get(target.id)
    if (!slot) {
      slot = {
        id: target.id,
        primitive: null,
        lastParamsKey: '',
        lastPoseKey: '',
        rebuildTimer: null,
        pending: null,
      }
      slots.set(target.id, slot)
    }

    const dims = boxExtents(target.cloudParams)
    const nextParams = paramsKeyOf(target, dims)
    const nextPose = poseKeyOf(target.longitude, target.latitude)

    ensureEntities(target, dims)

    if (nextParams === slot.lastParamsKey && nextPose === slot.lastPoseKey) {
      updateEntityPose(target, dims)
      return
    }

    updateEntityPose(target, dims)
    slot.pending = target

    const paramsChanged = nextParams !== slot.lastParamsKey
    if (paramsChanged || (!slot.primitive && target.primary)) {
      if (slot.rebuildTimer) clearTimeout(slot.rebuildTimer)
      slot.rebuildTimer = null
      buildPrimitive(slot, target, dims)
      slot.lastParamsKey = nextParams
      slot.lastPoseKey = nextPose
      viewer.scene.requestRender()
      return
    }

    slot.lastPoseKey = nextPose
    if (!slot.rebuildTimer) {
      const captured = slot
      slot.rebuildTimer = setTimeout(() => {
        captured.rebuildTimer = null
        const pending = captured.pending
        if (!pending) return
        const d = boxExtents(pending.cloudParams)
        buildPrimitive(captured, pending, d)
        captured.lastParamsKey = paramsKeyOf(pending, d)
        captured.lastPoseKey = poseKeyOf(pending.longitude, pending.latitude)
        viewer.scene.requestRender()
      }, 180)
    }
    viewer.scene.requestRender()
  }

  const setTargets = (targets: ReconstructionTarget[]) => {
    const keep = new Set(targets.map((t) => t.id))
    for (const [id, slot] of [...slots.entries()]) {
      if (!keep.has(id)) {
        clearSlot(slot)
        slots.delete(id)
      }
    }
    if (targets.length === 0) {
      viewer.scene.requestRender()
      return
    }
    for (const t of targets) upsertTarget(t)
    viewer.scene.requestRender()
  }

  return {
    setTarget: (target) => setTargets(target ? [target] : []),
    setTargets,
    setVisible,
    destroy: () => {
      for (const slot of slots.values()) clearSlot(slot)
      slots.clear()
    },
  }
}
