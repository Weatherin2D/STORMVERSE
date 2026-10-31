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

const VOLUME_PRIMITIVE_ID = 'stormverse-georegistered-volume'
const LABEL_ID = 'stormverse-volume-label'
const CORE_ID = 'stormverse-volume-core'
const ANVIL_ID = 'stormverse-volume-anvil'
const PRECIP_ID = 'stormverse-volume-precip'

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
  // Instance modelMatrix is baked into encoded positions for this Primitive.
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
): string {
  // Bake heuristic params + inverse model as consts — rebuilt when target changes.
  const density = params.density.toFixed(3)
  const vertical = params.verticalDevelopment.toFixed(3)
  const anvil = params.anvilExtent.toFixed(3)
  const turb = params.turbulence.toFixed(3)
  const hx = (dims.width * 0.5).toFixed(1)
  const hy = (dims.height * 0.5).toFixed(1)
  const hz = (dims.depth * 0.5).toFixed(1)
  const inv = mat4Glsl(inverseModel)

  return /* glsl */ `
in vec3 v_positionWC;

const vec3 u_half = vec3(${hx}, ${hy}, ${hz});
const float u_density = ${density};
const float u_vertical = ${vertical};
const float u_anvil = ${anvil};
const float u_turb = ${turb};
const mat4 u_inverseModel = ${inv};

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

// Local box coords → normalised storm space (~[-0.5, 0.5]); +Y is up in box space
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

  float tEnter;
  float tExit;
  if (!intersectBox(ro, rd, u_half, tEnter, tExit)) {
    discard;
  }
  tEnter = max(tEnter, 0.0);

  const int STEPS = 48;
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
      vec3 sampleCol = mix(vec3(0.28, 0.32, 0.38), vec3(0.86, 0.9, 0.95), light);
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
  out_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}
`
}

export interface GeoregisteredVolumeHandle {
  setTarget: (target: ReconstructionTarget | null) => void
  setVisible: (visible: boolean) => void
  destroy: () => void
}

function paramsKeyOf(target: ReconstructionTarget, dims: { width: number; height: number; depth: number }): string {
  return [
    dims.width.toFixed(0),
    dims.height.toFixed(0),
    target.cloudParams.density.toFixed(2),
    target.cloudParams.anvilExtent.toFixed(2),
    target.cloudParams.verticalDevelopment.toFixed(2),
    target.label,
  ].join('|')
}

function poseKeyOf(lon: number, lat: number): string {
  // ~110 m precision — enough for timeline animation without thrashing
  return `${lon.toFixed(3)}|${lat.toFixed(3)}`
}

/**
 * Places a procedural storm volume at geographic coordinates on the Cesium globe.
 * Labelled procedural — not a measured radar volume product.
 */
export function createGeoregisteredVolume(viewer: Viewer): GeoregisteredVolumeHandle {
  let primitive: Primitive | null = null
  let visible = true
  let lastParamsKey = ''
  let lastPoseKey = ''
  let lastProgress: number | undefined
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null
  let pendingTarget: ReconstructionTarget | null = null

  const baseHeight = 900

  const clearPrimitive = () => {
    if (primitive && !primitive.isDestroyed()) {
      viewer.scene.primitives.remove(primitive)
    }
    primitive = null
  }

  const clearEntities = () => {
    for (const id of [LABEL_ID, CORE_ID, ANVIL_ID, PRECIP_ID]) {
      viewer.entities.removeById(id)
    }
  }

  const setVisible = (v: boolean) => {
    visible = v
    if (primitive) primitive.show = v
    for (const id of [LABEL_ID, CORE_ID, ANVIL_ID, PRECIP_ID]) {
      const ent = viewer.entities.getById(id)
      if (ent) ent.show = v
    }
    viewer.scene.requestRender()
  }

  const updateEntityPose = (
    lon: number,
    lat: number,
    dims: { width: number; height: number; depth: number },
    anvilExtent: number,
    label: string,
    progress?: number,
  ) => {
    const coreHeight = Math.max(10_000, dims.height * 0.95)
    const core = viewer.entities.getById(CORE_ID)
    if (core) {
      core.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, baseHeight + coreHeight * 0.5),
      )
    }
    const anvil = viewer.entities.getById(ANVIL_ID)
    if (anvil) {
      anvil.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(
          lon + 0.06 * anvilExtent,
          lat,
          baseHeight + coreHeight + 1_500,
        ),
      )
    }
    const precip = viewer.entities.getById(PRECIP_ID)
    if (precip) {
      precip.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, baseHeight + 3_500),
      )
    }
    const labelEnt = viewer.entities.getById(LABEL_ID)
    if (labelEnt) {
      labelEnt.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(lon, lat, baseHeight + dims.height + 2_500),
      )
      if (labelEnt.label) {
        const prog =
          progress != null ? `\ntrack ${Math.round(progress * 100)}% · animated` : ''
        labelEnt.label.text = new ConstantProperty(
          `${label}\nprocedural · georegistered${prog}`,
        )
      }
    }
  }

  const buildPrimitive = (target: ReconstructionTarget, dims: ReturnType<typeof boxExtents>) => {
    clearPrimitive()
    const origin = Cartesian3.fromDegrees(target.longitude, target.latitude, baseHeight)
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
      fragmentShaderSource: volumeFragmentShader(target.cloudParams, dims, inverseModel),
    })

    primitive = viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry,
          modelMatrix,
          id: VOLUME_PRIMITIVE_ID,
        }),
        appearance,
        asynchronous: false,
        compressVertices: false,
        allowPicking: true,
        show: visible,
      }),
    )
  }

  const ensureEntities = (
    target: ReconstructionTarget,
    dims: ReturnType<typeof boxExtents>,
  ) => {
    if (viewer.entities.getById(CORE_ID)) {
      updateEntityPose(
        target.longitude,
        target.latitude,
        dims,
        target.cloudParams.anvilExtent,
        target.label,
        target.drivers.alongTrackProgress,
      )
      return
    }

    const coreRadius = 7_500 + target.cloudParams.density * 4_500
    const coreHeight = Math.max(10_000, dims.height * 0.95)
    viewer.entities.add({
      id: CORE_ID,
      position: Cartesian3.fromDegrees(
        target.longitude,
        target.latitude,
        baseHeight + coreHeight * 0.5,
      ),
      ellipsoid: {
        radii: new Cartesian3(coreRadius, coreRadius * 0.88, coreHeight * 0.5),
        material: Color.fromCssColorString('#9aa8b8').withAlpha(0.45),
        outline: true,
        outlineColor: Color.fromCssColorString('#e4eef8').withAlpha(0.65),
      },
      show: visible,
    })

    const anvilR = 16_000 + target.cloudParams.anvilExtent * 20_000
    viewer.entities.add({
      id: ANVIL_ID,
      position: Cartesian3.fromDegrees(
        target.longitude + 0.06 * target.cloudParams.anvilExtent,
        target.latitude,
        baseHeight + coreHeight + 1_500,
      ),
      ellipsoid: {
        radii: new Cartesian3(anvilR, anvilR * 0.65, 2_200 + target.cloudParams.anvilExtent * 1_400),
        material: Color.fromCssColorString('#c2d0de').withAlpha(0.4),
        outline: true,
        outlineColor: Color.fromCssColorString('#f2f7fc').withAlpha(0.5),
      },
      show: visible,
    })

    viewer.entities.add({
      id: PRECIP_ID,
      position: Cartesian3.fromDegrees(target.longitude, target.latitude, baseHeight + 3_500),
      cylinder: {
        length: 7_000,
        topRadius: 2_200,
        bottomRadius: 5_500,
        material: Color.fromCssColorString('#5a7a98').withAlpha(0.35),
      },
      show: visible,
    })

    const prog =
      target.drivers.alongTrackProgress != null
        ? `\ntrack ${Math.round(target.drivers.alongTrackProgress * 100)}% · animated`
        : ''
    viewer.entities.add({
      id: LABEL_ID,
      position: Cartesian3.fromDegrees(
        target.longitude,
        target.latitude,
        baseHeight + dims.height + 2_500,
      ),
      label: {
        text: `${target.label}\nprocedural · georegistered${prog}`,
        font: '12px "IBM Plex Sans", system-ui, sans-serif',
        fillColor: Color.WHITE,
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

  const flushRebuild = () => {
    rebuildTimer = null
    const target = pendingTarget
    if (!target) return
    const dims = boxExtents(target.cloudParams)
    buildPrimitive(target, dims)
    lastPoseKey = poseKeyOf(target.longitude, target.latitude)
    lastParamsKey = paramsKeyOf(target, dims)
    lastProgress = target.drivers.alongTrackProgress
    viewer.scene.requestRender()
  }

  const setTarget = (target: ReconstructionTarget | null) => {
    if (!target) {
      if (rebuildTimer) clearTimeout(rebuildTimer)
      rebuildTimer = null
      pendingTarget = null
      clearPrimitive()
      clearEntities()
      lastParamsKey = ''
      lastPoseKey = ''
      viewer.scene.requestRender()
      return
    }

    const dims = boxExtents(target.cloudParams)
    const nextParams = paramsKeyOf(target, dims)
    const nextPose = poseKeyOf(target.longitude, target.latitude)

    if (nextParams === lastParamsKey && nextPose === lastPoseKey && primitive) {
      if (target.drivers.alongTrackProgress !== lastProgress) {
        lastProgress = target.drivers.alongTrackProgress
        updateEntityPose(
          target.longitude,
          target.latitude,
          dims,
          target.cloudParams.anvilExtent,
          target.label,
          target.drivers.alongTrackProgress,
        )
        viewer.scene.requestRender()
      }
      setVisible(visible)
      return
    }

    // Schematic entities move immediately for smooth track following
    ensureEntities(target, dims)
    updateEntityPose(
      target.longitude,
      target.latitude,
      dims,
      target.cloudParams.anvilExtent,
      target.label,
      target.drivers.alongTrackProgress,
    )

    const paramsChanged = nextParams !== lastParamsKey
    pendingTarget = target

    if (paramsChanged || !primitive) {
      if (rebuildTimer) clearTimeout(rebuildTimer)
      flushRebuild()
      return
    }

    // Pose-only: throttle raymarch rebuild so timeline play stays responsive
    lastPoseKey = nextPose
    lastProgress = target.drivers.alongTrackProgress
    if (!rebuildTimer) {
      rebuildTimer = setTimeout(flushRebuild, 180)
    }
    viewer.scene.requestRender()
  }

  return {
    setTarget,
    setVisible,
    destroy: () => {
      if (rebuildTimer) clearTimeout(rebuildTimer)
      clearPrimitive()
      clearEntities()
    },
  }
}
