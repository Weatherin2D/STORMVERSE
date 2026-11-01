import {
  Appearance,
  BillboardCollection,
  BlendingState,
  BoxGeometry,
  Cartesian3,
  Color,
  GeometryInstance,
  HorizontalOrigin,
  ImageMaterialProperty,
  Matrix4,
  NearFarScalar,
  Primitive,
  Rectangle,
  Transforms,
  VertexFormat,
  VerticalOrigin,
  type Viewer,
} from 'cesium'
import type { CloudFieldPoint } from '../../weather/adapters/cloudCoverGrid'
import type { ImageryCloudTile } from '../../weather/adapters/imageryCloudTiles'

export interface GlobalCloudFieldHandle {
  setField: (field: { points: CloudFieldPoint[]; tiles?: ImageryCloudTile[] }) => void
  setVisible: (visible: boolean) => void
  setImmersiveEmphasis: (immersive: boolean) => void
  destroy: () => void
}

/** Neutral cloud albedo — works day/sunset/night; lighting comes from form + local sun. */
const BAND_RGB: Record<CloudFieldPoint['band'], [number, number, number]> = {
  low: [232, 236, 244],
  mid: [240, 244, 250],
  high: [248, 250, 255],
}

/** Soft irregular blotch for distant fill — not a hard disc. */
function makeCloudTexture(seed: number): HTMLCanvasElement {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const lobes = 10 + (seed % 5)
  for (let i = 0; i < lobes; i++) {
    const t = (i + 1) / lobes
    const cx = size * (0.2 + ((seed * 19 + i * 41) % 100) / 160)
    const cy = size * (0.32 + ((seed * 23 + i * 17) % 100) / 200)
    const rx = size * (0.14 + t * 0.28)
    const ry = rx * (0.5 + ((seed + i * 7) % 45) / 100)
    const g = ctx.createRadialGradient(cx, cy - ry * 0.2, 0, cx, cy, Math.max(rx, ry))
    g.addColorStop(0, `rgba(255,255,255,${0.7 - t * 0.3})`)
    g.addColorStop(0.35, `rgba(236,242,250,${0.38 - t * 0.15})`)
    g.addColorStop(0.7, `rgba(210,220,235,${0.14 - t * 0.06})`)
    g.addColorStop(1, 'rgba(190,205,225,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, ((seed + i) % 14) * 0.18, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(
    size / 2,
    size * 0.58,
    size * 0.06,
    size / 2,
    size * 0.5,
    size * 0.52,
  )
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.55, 'rgba(0,0,0,0.9)')
  mask.addColorStop(0.85, 'rgba(0,0,0,0.3)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
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

/**
 * Daytime volumetric look inspired by MeteoLab StormLab references:
 * cauliflower towers, spreading anvil, deep cool shadowed bases, bright lit tops.
 * Albedo stays neutral so sunset/sunrise/night globe lighting is not forced to daytime.
 */
function cloudVolumeFragment(
  dims: { width: number; depth: number; height: number },
  inverseModel: Matrix4,
  density: number,
  tint: [number, number, number],
  iceShare: number,
  anvil: number,
): string {
  const hx = (dims.width * 0.5).toFixed(1)
  const hy = (dims.height * 0.5).toFixed(1)
  const hz = (dims.depth * 0.5).toFixed(1)
  const inv = mat4Glsl(inverseModel)
  const [tr, tg, tb] = tint.map((c) => (c / 255).toFixed(3))
  const d = density.toFixed(3)
  const ice = iceShare.toFixed(3)
  const anv = anvil.toFixed(3)
  return /* glsl */ `
in vec3 v_positionWC;
const vec3 u_half = vec3(${hx}, ${hy}, ${hz});
const float u_density = ${d};
const float u_ice = ${ice};
const float u_anvil = ${anv};
const mat4 u_inverseModel = ${inv};
const vec3 u_tint = vec3(${tr}, ${tg}, ${tb});
const float PI = 3.14159265;

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
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
float billow(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 5; i++) {
    float n = noise3(p);
    v += a * abs(n * 2.0 - 1.0);
    p = p * 2.15 + vec3(3.1, 1.7, 5.9);
    a *= 0.52;
  }
  return clamp(v, 0.0, 1.2);
}
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
float phase(float c) {
  return mix(hg(c, -0.2), hg(c, 0.78), 0.35) * 4.0 * PI;
}
float sunThrough(float od) {
  return max(exp(-od), 1.0 / (1.0 + 1.85 * od));
}

float cloudDensity(vec3 local) {
  vec3 q = local / (u_half * 2.0);
  float h = q.y;
  float radial = length(q.xz);

  // Flat condensation base — dark bases sit above a clean cut.
  float above = h + 0.44;
  if (above < -0.08) return 0.0;
  float under = smoothstep(-0.08, 0.1, above);
  float rise = smoothstep(0.0, 0.28, above);

  // Soft lower deck + convective tower + spreading anvil.
  float deck = (1.0 - smoothstep(0.18, 0.5, radial))
             * smoothstep(-0.45, -0.28, h)
             * (1.0 - smoothstep(-0.12, 0.18, h));
  float tower = (1.0 - smoothstep(0.05, 0.22, length(q.xz)))
              * smoothstep(-0.42, -0.18, h)
              * (1.0 - smoothstep(0.08, 0.48, h));
  float anvilR = mix(0.28, 0.52, u_anvil);
  float anvilY = mix(0.12, 0.28, u_anvil);
  float anvilShape = (1.0 - smoothstep(anvilR * 0.25, anvilR, length(q.xz - vec2(u_anvil * 0.06, 0.0))))
                   * exp(-pow((h - anvilY) / mix(0.08, 0.14, u_ice), 2.0))
                   * mix(0.15, 1.0, u_anvil);
  float body = max(max(deck * 0.85, tower), anvilShape);

  // Cauliflower on towers; fibrous ice on anvil/cirrus.
  float liquidN = min(1.15, billow(q * 2.6 + vec3(0.15, 0.04, -0.12)) * 1.4);
  float iceN = fbm(q * vec3(0.55, 3.0, 0.55) + vec3(0.2, 0.0, -0.15));
  float softN = fbm(q * 1.35 + vec3(0.05, 0.02, -0.03));
  float n = mix(softN, liquidN, clamp(tower * 1.4, 0.0, 1.0));
  n = mix(n, iceN, clamp(u_ice + u_anvil * 0.45, 0.0, 1.0));

  float erode = (1.0 - n) * mix(0.32, 0.18, u_ice) * (1.0 - body * 0.5) * mix(0.2, 1.0, rise);
  float d = max(body * 0.4, body * 1.4 - erode);
  d *= (1.0 + 2.8 * tower * (1.0 - u_ice * 0.7)) * mix(1.0, 0.78, u_ice);
  return clamp(d * u_density, 0.0, 1.6) * under;
}

void main() {
  vec3 local = (u_inverseModel * vec4(v_positionWC, 1.0)).xyz;
  vec3 camLocal = (u_inverseModel * vec4(czm_viewerPositionWC, 1.0)).xyz;
  vec3 rd = normalize(local - camLocal);
  vec3 ro = camLocal;

  vec3 invRd = 1.0 / mix(rd, vec3(1e-5), lessThan(abs(rd), vec3(1e-5)));
  vec3 tmin = (-u_half - ro) * invRd;
  vec3 tmax = ( u_half - ro) * invRd;
  vec3 t1v = min(tmin, tmax);
  vec3 t2v = max(tmin, tmax);
  float tMin = max(max(t1v.x, t1v.y), t1v.z);
  float tMax = min(min(t2v.x, t2v.y), t2v.z);
  if (tMax < max(tMin, 0.0)) discard;
  tMin = max(tMin, 0.0);

  // Local form light only — does not override globe sunset/night palette.
  vec3 sunLocal = normalize(vec3(0.32, 0.88, 0.22));
  float cosT = dot(-rd, sunLocal);
  float ph = phase(cosT);

  float stepSize = (tMax - tMin) / 42.0;
  vec4 acc = vec4(0.0);
  float t = tMin + stepSize * 0.5;
  for (int i = 0; i < 42; i++) {
    if (acc.a > 0.95 || t > tMax) break;
    vec3 p = ro + rd * t;
    float dens = cloudDensity(p);
    if (dens > 0.018) {
      float od = dens * 0.45;
      od += cloudDensity(p + sunLocal * (u_half.y * 0.09)) * 0.65;
      od += cloudDensity(p + sunLocal * (u_half.y * 0.2)) * 0.95;
      od += cloudDensity(p + sunLocal * (u_half.y * 0.38)) * 1.2;

      float powder = 1.0 - exp(-dens * 1.7);
      float h = clamp((p.y / u_half.y) * 0.5 + 0.5, 0.0, 1.0);
      // Cool blue-gray shadow bases + bright lit tops (reference daytime look).
      vec3 shadowTint = mix(vec3(0.42, 0.48, 0.58), u_tint * 0.55, 0.35);
      vec3 litTint = mix(u_tint, vec3(1.0, 0.995, 0.98), 0.55);
      vec3 ambient = mix(shadowTint, litTint * 0.92, h);
      float through = sunThrough(od);
      vec3 sunCol = litTint * (0.4 + 0.75 * ph * 0.2) * through * mix(0.55, 1.05, powder);
      vec3 lit = sunCol + ambient * mix(0.28, 0.95, through);
      // Silver lining on thin edges against the sun.
      lit += litTint * powder * max(0.0, cosT) * 0.18 * through;

      float a = (1.0 - exp(-dens * 1.85)) * 0.32;
      acc.rgb += (1.0 - acc.a) * a * lit;
      acc.a += (1.0 - acc.a) * a;
    }
    t += stepSize;
  }
  if (acc.a < 0.02) discard;
  out_FragColor = vec4(acc.rgb, clamp(acc.a, 0.0, 0.94));
}
`
}

export function createGlobalCloudField(viewer: Viewer): GlobalCloudFieldHandle {
  const textures = [0, 1, 2, 3, 4].map((s) => makeCloudTexture(s + 11))
  let billboards: BillboardCollection | null = null
  let volumePrimitives: Primitive[] = []
  const sheetEntityIds: string[] = []
  let visible = true
  let immersive = false
  let cached: CloudFieldPoint[] = []
  let cachedTiles: ImageryCloudTile[] = []

  const clear = () => {
    if (billboards) {
      viewer.scene.primitives.remove(billboards)
      billboards = null
    }
    for (const p of volumePrimitives) {
      viewer.scene.primitives.remove(p)
    }
    volumePrimitives = []
    for (const id of sheetEntityIds) {
      viewer.entities.removeById(id)
    }
    sheetEntityIds.length = 0
  }

  const addSheets = (tile: ImageryCloudTile, tileIndex: number) => {
    const layers = cachedTiles.length > 80 ? (immersive ? 3 : 2) : immersive ? 4 : 3
    const span = Math.max(900, tile.topHeightM - tile.baseHeightM)
    const alpha = Math.min(0.55, 0.2 + tile.meanIntensity * 0.4)
    for (let L = 0; L < layers; L++) {
      const t = L / Math.max(1, layers - 1)
      const h = tile.baseHeightM + t * span
      const id = `cloud-sheet-${tile.z}-${tile.x}-${tile.y}-L${L}-${tileIndex}`
      viewer.entities.add({
        id,
        show: true,
        rectangle: {
          coordinates: Rectangle.fromDegrees(tile.west, tile.south, tile.east, tile.north),
          height: h,
          material: new ImageMaterialProperty({
            image: tile.cloudImage,
            transparent: true,
            color: Color.fromBytes(240, 246, 255, Math.floor(alpha * 255 * (0.65 + t * 0.35))),
          }),
        },
      })
      sheetEntityIds.push(id)
    }
  }

  const addVolume = (p: CloudFieldPoint) => {
    const vigor = p.volumeStrength || p.cover
    const anvilAmt = p.band === 'high' ? 0.95 : p.band === 'mid' && vigor > 0.55 ? 0.65 : vigor * 0.25
    const width = Math.max(
      12_000,
      (p.horizontalScaleM || 24_000) * (1.15 + anvilAmt * 0.55),
    )
    const depth = width * (0.88 + anvilAmt * 0.12)
    const height = Math.max(
      4_000,
      p.thicknessM * (p.band === 'high' ? 0.7 : 1.15 + vigor * 0.35),
    )
    const dims = { width, depth, height }
    const base = Math.max(280, p.heightM - height * 0.5)
    const origin = Cartesian3.fromDegrees(p.longitude, p.latitude, base)
    const enu = Transforms.eastNorthUpToFixedFrame(origin)
    const swapYZ = new Matrix4(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
    const lift = Matrix4.fromTranslation(new Cartesian3(0, 0, height * 0.5), new Matrix4())
    const local = Matrix4.multiply(lift, swapYZ, new Matrix4())
    const modelMatrix = Matrix4.multiply(enu, local, new Matrix4())
    const inverse = Matrix4.inverse(modelMatrix, new Matrix4())
    const geometry = BoxGeometry.fromDimensions({
      dimensions: new Cartesian3(width, height, depth),
      vertexFormat: VertexFormat.POSITION_ONLY,
    })

    const tint = BAND_RGB[p.band]
    const density = 0.7 + vigor * 0.85
    const iceShare = p.band === 'high' ? 0.95 : p.band === 'mid' ? 0.4 : 0.06
    const appearance = new Appearance({
      translucent: true,
      closed: true,
      renderState: {
        blending: BlendingState.ALPHA_BLEND,
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: true, face: 1028 },
      },
      fragmentShaderSource: cloudVolumeFragment(
        dims,
        inverse,
        density,
        tint,
        iceShare,
        anvilAmt,
      ),
      vertexShaderSource: volumeVertexShader(),
    })

    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry,
        modelMatrix,
        id: `cloud-vol-${p.longitude.toFixed(3)}-${p.latitude.toFixed(3)}`,
      }),
      appearance,
      asynchronous: false,
      allowPicking: false,
      compressVertices: false,
    })
    viewer.scene.primitives.add(primitive)
    volumePrimitives.push(primitive)
  }

  const rebuild = () => {
    clear()
    if (!visible || (cached.length === 0 && cachedTiles.length === 0)) {
      viewer.scene.requestRender()
      return
    }

    const shaped = cachedTiles.length > 0
    if (shaped) {
      const maxTiles = immersive ? 260 : 200
      cachedTiles
        .slice()
        .sort((a, b) => b.meanIntensity - a.meanIntensity)
        .slice(0, maxTiles)
        .forEach((tile, i) => addSheets(tile, i))
    }

    const sorted = [...cached].sort(
      (a, b) => (b.volumeStrength || b.cover) - (a.volumeStrength || a.cover),
    )

    // Prefer ray-marched towers for the reference look.
    const maxVolumes = shaped ? (immersive ? 120 : 90) : immersive ? 80 : 60
    sorted.slice(0, maxVolumes).forEach((p) => {
      if ((p.volumeStrength || p.cover) < (shaped ? 0.22 : 0.18)) return
      if (shaped) {
        addVolume({
          ...p,
          horizontalScaleM: Math.min(
            Math.max((p.horizontalScaleM || 10_000) * 1.55, 14_000),
            42_000,
          ),
          thicknessM: Math.max(p.thicknessM, 5_500),
        })
        return
      }
      addVolume({
        ...p,
        horizontalScaleM: Math.max(p.horizontalScaleM || 28_000, 22_000),
        thicknessM: Math.max(p.thicknessM, 6_000),
      })
    })

    const maxBillboardCells = shaped
      ? immersive
        ? 2800
        : 2000
      : immersive
        ? 600
        : 450
    const cells = sorted.slice(0, maxBillboardCells)
    billboards = new BillboardCollection({ scene: viewer.scene })
    viewer.scene.primitives.add(billboards)

    cells.forEach((p, i) => {
      const pixelScale = p.horizontalScaleM || 24_000
      const scale = shaped
        ? Math.max(3_000, pixelScale) * (immersive ? 1.5 : 1.3)
        : Math.max(14_000, pixelScale) * (immersive ? 1.25 : 1.1)
      const baseH = Math.max(450, p.heightM - p.thicknessM * 0.42)
      const thick = Math.max(2_500, p.thicknessM)
      const layers = shaped
        ? cells.length > 1800
          ? 1
          : 2
        : Math.min(4, 2 + Math.floor(p.cover * 3))
      const [r, g, b] = BAND_RGB[p.band]
      const alpha = Math.min(0.82, 0.24 + p.cover * 0.48 + (immersive ? 0.06 : 0))
      const metersToDegLat = 1 / 111_320
      const metersToDegLon =
        1 / (111_320 * Math.max(0.2, Math.cos((p.latitude * Math.PI) / 180)))

      for (let L = 0; L < layers; L++) {
        const t = layers === 1 ? 0.4 : L / (layers - 1)
        const h = baseH + t * thick * 0.8
        const ang = (i * 1.7 + L * 2.3) % (Math.PI * 2)
        const radM = scale * (shaped ? 0.035 : 0.1) * (0.4 + (L % 3) * 0.2)
        const lon = p.longitude + radM * Math.cos(ang) * metersToDegLon
        const lat = p.latitude + radM * Math.sin(ang) * metersToDegLat
        const size = scale * (0.9 + (1 - Math.abs(t - 0.4)) * 0.28)
        billboards!.add({
          position: Cartesian3.fromDegrees(lon, lat, h),
          image: textures[(i + L) % textures.length],
          width: size * (p.band === 'high' ? 1.3 : 1.1),
          height: size * (p.band === 'high' ? 0.3 : 0.4 + (1 - t) * 0.12),
          sizeInMeters: true,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          color: Color.fromBytes(r, g, b, Math.floor(alpha * 255 * (0.7 + t * 0.3))),
          alignedAxis: Cartesian3.UNIT_Z,
          disableDepthTestDistance: immersive ? 5.0e5 : Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(2.0e4, 1.05, 4.0e6, shaped ? 0.48 : 0.38),
          translucencyByDistance: new NearFarScalar(8.0e3, 1.0, 6.0e6, 0.2),
        })
      }
    })

    viewer.scene.requestRender()
  }

  return {
    setField: (field) => {
      cached = field.points
      cachedTiles = field.tiles ?? []
      rebuild()
    },
    setVisible: (v) => {
      visible = v
      rebuild()
    },
    setImmersiveEmphasis: (v) => {
      immersive = v
      rebuild()
    },
    destroy: () => clear(),
  }
}
