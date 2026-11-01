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

const BAND_RGB: Record<CloudFieldPoint['band'], [number, number, number]> = {
  low: [228, 232, 240],
  mid: [236, 240, 248],
  high: [245, 248, 255],
}

/**
 * Soft irregular cumulus blotches (MeteoLab-like soft edges), not hard spheres.
 */
function makeCloudTexture(seed: number): HTMLCanvasElement {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  // Layered irregular lobes — cauliflower / soft cumulus, not a disc.
  const lobes = 9 + (seed % 5)
  for (let i = 0; i < lobes; i++) {
    const t = (i + 1) / lobes
    const cx = size * (0.22 + ((seed * 19 + i * 41) % 100) / 180)
    const cy = size * (0.34 + ((seed * 23 + i * 17) % 100) / 220)
    const rx = size * (0.16 + t * 0.26)
    const ry = rx * (0.55 + ((seed + i * 7) % 40) / 100)
    const g = ctx.createRadialGradient(cx, cy - ry * 0.15, 0, cx, cy, Math.max(rx, ry))
    g.addColorStop(0, `rgba(255,255,255,${0.62 - t * 0.28})`)
    g.addColorStop(0.4, `rgba(240,244,250,${0.32 - t * 0.14})`)
    g.addColorStop(0.75, `rgba(220,228,240,${0.12 - t * 0.06})`)
    g.addColorStop(1, 'rgba(200,210,230,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, ((seed + i) % 12) * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft vignette — keep a flat-ish base, feathered sides (MeteoLab flat condensation base feel).
  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(size / 2, size * 0.58, size * 0.08, size / 2, size * 0.5, size * 0.52)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.55, 'rgba(0,0,0,0.92)')
  mask.addColorStop(0.82, 'rgba(0,0,0,0.35)')
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
 * Ray-marched cloud volume shading inspired by MeteoLab StormLab (MIT, Bandananor):
 * flat condensation base, cauliflower billows on towers, fibrous ice on anvils,
 * two-stream sun-through lighting and soft powder edges.
 */
function cloudVolumeFragment(
  dims: { width: number; depth: number; height: number },
  inverseModel: Matrix4,
  density: number,
  tint: [number, number, number],
  iceShare: number,
): string {
  const hx = (dims.width * 0.5).toFixed(1)
  const hy = (dims.height * 0.5).toFixed(1)
  const hz = (dims.depth * 0.5).toFixed(1)
  const inv = mat4Glsl(inverseModel)
  const [tr, tg, tb] = tint.map((c) => (c / 255).toFixed(3))
  const d = density.toFixed(3)
  const ice = iceShare.toFixed(3)
  return /* glsl */ `
in vec3 v_positionWC;
const vec3 u_half = vec3(${hx}, ${hy}, ${hz});
const float u_density = ${d};
const float u_ice = ${ice};
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
// Cauliflower billows (|2n-1| lobes) — MeteoLab-style growing towers.
float billow(vec3 p) {
  float v = 0.0;
  float a = 0.6;
  for (int i = 0; i < 4; i++) {
    float n = noise3(p);
    v += a * abs(n * 2.0 - 1.0);
    p = p * 2.1 + vec3(3.1, 1.7, 5.9);
    a *= 0.5;
  }
  return v;
}
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}
float phase(float c) {
  return mix(hg(c, -0.15), hg(c, 0.72), 0.32) * 4.0 * PI;
}
float sunThrough(float od) {
  return max(exp(-od), 1.0 / (1.0 + 1.7 * od));
}

float cloudDensity(vec3 local) {
  vec3 q = local / (u_half * 2.0);
  float h = q.y; // -0.5..0.5, bottom to top
  float radial = length(q.xz);

  // Flat condensation base — no cloud under the base, soft fade in above.
  float above = h + 0.42;
  if (above < -0.05) return 0.0;
  float under = smoothstep(-0.05, 0.12, above);
  float rise = smoothstep(0.0, 0.35, above);

  // Soft dome / anvil body + convective tower.
  float dome = 1.0 - smoothstep(0.12, 0.48, radial);
  dome *= (1.0 - smoothstep(0.05, 0.48, h));
  float tower = 1.0 - smoothstep(0.06, 0.24, length(q.xz));
  tower *= smoothstep(-0.42, -0.15, h) * (1.0 - smoothstep(0.12, 0.5, h));
  float body = max(dome * 0.95, tower);

  // Liquid towers: billows. Ice/cirrus: fibrous horizontal wisps.
  float liquidN = min(1.0, billow(q * 2.4 + vec3(0.2, 0.05, -0.1)) * 1.35);
  float iceN = fbm(q * vec3(0.7, 3.1, 0.7) + vec3(0.15, 0.0, -0.2));
  float n = mix(liquidN, iceN, u_ice);
  // Soft cumulus falloff elsewhere
  n = mix(fbm(q * 1.4), n, 0.55 + 0.35 * tower);

  // Carve edges with noise but keep a solid core so masses stay visible.
  float erode = (1.0 - n) * mix(0.28, 0.16, u_ice) * (1.0 - body * 0.55) * mix(0.2, 1.0, rise);
  float d = max(0.0, body * 1.35 - erode);
  d = max(d, body * 0.35);
  d *= (1.0 + 2.4 * tower * (1.0 - u_ice)) * mix(1.0, 0.8, u_ice);
  return clamp(d * u_density, 0.0, 1.5) * under;
}

void main() {
  vec4 localH = u_inverseModel * vec4(v_positionWC, 1.0);
  vec3 local = localH.xyz;
  vec3 camLocal = (u_inverseModel * vec4(czm_viewerPositionWC, 1.0)).xyz;
  vec3 rd = normalize(local - camLocal);
  vec3 ro = camLocal;

  // Stable AABB ray hit (sign trick can NaN on axis-aligned rays).
  vec3 invRd = 1.0 / mix(rd, vec3(1e-5), lessThan(abs(rd), vec3(1e-5)));
  vec3 tmin = (-u_half - ro) * invRd;
  vec3 tmax = ( u_half - ro) * invRd;
  vec3 t1v = min(tmin, tmax);
  vec3 t2v = max(tmin, tmax);
  float tMin = max(max(t1v.x, t1v.y), t1v.z);
  float tMax = min(min(t2v.x, t2v.y), t2v.z);
  if (tMax < max(tMin, 0.0)) discard;
  tMin = max(tMin, 0.0);

  // Fixed local sun (Appearance shaders have no czm_lightDirectionWC).
  vec3 sunLocal = normalize(vec3(0.35, 0.82, 0.28));
  float cosT = dot(-rd, sunLocal);
  float ph = phase(cosT);

  float stepSize = (tMax - tMin) / 36.0;
  vec4 acc = vec4(0.0);
  float t = tMin + stepSize * 0.5;
  for (int i = 0; i < 36; i++) {
    if (acc.a > 0.94 || t > tMax) break;
    vec3 p = ro + rd * t;
    float d = cloudDensity(p);
    if (d > 0.02) {
      float od = d * 0.4;
      od += cloudDensity(p + sunLocal * (u_half.y * 0.1)) * 0.55;
      od += cloudDensity(p + sunLocal * (u_half.y * 0.22)) * 0.75;
      float powder = 1.0 - exp(-d * 1.4);
      float h = clamp((p.y / u_half.y) * 0.5 + 0.5, 0.0, 1.0);
      vec3 ambient = mix(u_tint * 0.48, u_tint * 1.08, h);
      vec3 sunCol = mix(u_tint * 0.8, vec3(1.0, 0.98, 0.95), 0.5);
      vec3 lit = sunCol * (0.35 + 0.55 * ph * 0.18) * sunThrough(od) * mix(0.6, 1.0, powder)
               + ambient * mix(0.35, 1.0, sunThrough(od * 0.55));
      float a = (1.0 - exp(-d * 1.55)) * 0.28;
      acc.rgb += (1.0 - acc.a) * a * lit;
      acc.a += (1.0 - acc.a) * a;
    }
    t += stepSize;
  }
  if (acc.a < 0.02) discard;
  out_FragColor = vec4(acc.rgb, clamp(acc.a, 0.0, 0.92));
}
`
}

/**
 * Global clouds with MeteoLab-inspired volumetric look: mosaic footprint sheets,
 * soft irregular fill sprites, and ray-marched cores with billows / ice wisps.
 */
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
    // Visible mosaic silhouette + soft altitude stack (volumes add MeteoLab depth).
    const layers = cachedTiles.length > 80 ? (immersive ? 3 : 2) : immersive ? 4 : 3
    const span = Math.max(800, tile.topHeightM - tile.baseHeightM)
    const alpha = Math.min(0.72, 0.28 + tile.meanIntensity * 0.5)
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
            color: Color.fromBytes(245, 248, 255, Math.floor(alpha * 255 * (0.7 + t * 0.3))),
          }),
        },
      })
      sheetEntityIds.push(id)
    }
  }

  const addVolume = (p: CloudFieldPoint) => {
    const width = Math.max(10_000, (p.horizontalScaleM || 24_000) * (p.band === 'high' ? 1.45 : 1.2))
    const depth = width * (p.band === 'high' ? 1.05 : 0.92)
    const height = Math.max(3_200, p.thicknessM * (p.band === 'high' ? 0.75 : 1.05))
    const dims = { width, depth, height }
    const base = Math.max(350, p.heightM - height * 0.48)
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
    const density = 0.62 + (p.volumeStrength || p.cover) * 0.75
    const iceShare = p.band === 'high' ? 0.92 : p.band === 'mid' ? 0.35 : 0.08
    const appearance = new Appearance({
      translucent: true,
      closed: true,
      renderState: {
        blending: BlendingState.ALPHA_BLEND,
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: true, face: 1028 },
      },
      fragmentShaderSource: cloudVolumeFragment(dims, inverse, density, tint, iceShare),
      vertexShaderSource: volumeVertexShader(),
    })

    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry,
        modelMatrix,
        id: `cloud-vol-${p.longitude}-${p.latitude}`,
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
      const maxTiles = immersive ? 280 : 220
      cachedTiles
        .slice()
        .sort((a, b) => b.meanIntensity - a.meanIntensity)
        .slice(0, maxTiles)
        .forEach((tile, i) => addSheets(tile, i))
    }

    const sorted = [...cached].sort(
      (a, b) => (b.volumeStrength || b.cover) - (a.volumeStrength || a.cover),
    )

    // Ray-marched cores carry the MeteoLab look — prefer more volumes, fewer hard sprites.
    const maxVolumes = shaped ? (immersive ? 96 : 72) : immersive ? 64 : 48
    sorted.slice(0, maxVolumes).forEach((p) => {
      if ((p.volumeStrength || p.cover) < (shaped ? 0.28 : 0.22)) return
      if (shaped && (p.horizontalScaleM || 0) > 0) {
        addVolume({
          ...p,
          horizontalScaleM: Math.min(
            Math.max(p.horizontalScaleM || 8_000, 8_000) * 1.35,
            28_000,
          ),
        })
        return
      }
      addVolume(p)
    })

    // Soft distant fill only — irregular blotches, not sphere packs.
    const maxBillboardCells = shaped
      ? immersive
        ? 3200
        : 2400
      : immersive
        ? 700
        : 520
    const cells = sorted.slice(0, maxBillboardCells)
    billboards = new BillboardCollection({ scene: viewer.scene })
    viewer.scene.primitives.add(billboards)

    cells.forEach((p, i) => {
      const pixelScale = p.horizontalScaleM || 24_000
      const scale = shaped
        ? Math.max(2_400, pixelScale) * (immersive ? 1.45 : 1.25)
        : Math.max(12_000, pixelScale) * (immersive ? 1.2 : 1.05)
      const baseH = Math.max(500, p.heightM - p.thicknessM * 0.4)
      const thick = Math.max(2_200, p.thicknessM)
      const layers = shaped
        ? cells.length > 2000
          ? 1
          : Math.min(2, 1 + Math.floor(p.cover * 1.2))
        : Math.min(4, 2 + Math.floor(p.cover * 3))
      const [r, g, b] = BAND_RGB[p.band]
      const alpha = Math.min(0.88, 0.28 + p.cover * 0.5 + (immersive ? 0.08 : 0))

      const metersToDegLat = 1 / 111_320
      const metersToDegLon =
        1 / (111_320 * Math.max(0.2, Math.cos((p.latitude * Math.PI) / 180)))

      for (let L = 0; L < layers; L++) {
        const t = layers === 1 ? 0.45 : L / (layers - 1)
        const h = baseH + t * thick * 0.85
        const ang = (i * 1.7 + L * 2.3) % (Math.PI * 2)
        const radM = scale * (shaped ? 0.03 : 0.1) * (0.4 + (L % 3) * 0.2)
        const lon = p.longitude + radM * Math.cos(ang) * metersToDegLon
        const lat = p.latitude + radM * Math.sin(ang) * metersToDegLat
        // Flattened soft mass — wider than tall, like MeteoLab soft cumulus.
        const size = scale * (0.85 + (1 - Math.abs(t - 0.4)) * 0.3)
        billboards!.add({
          position: Cartesian3.fromDegrees(lon, lat, h),
          image: textures[(i + L) % textures.length],
          width: size * (p.band === 'high' ? 1.25 : 1.05),
          height: size * (p.band === 'high' ? 0.32 : 0.42 + (1 - t) * 0.12),
          sizeInMeters: true,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          color: Color.fromBytes(r, g, b, Math.floor(alpha * 255 * (0.7 + t * 0.3))),
          alignedAxis: Cartesian3.UNIT_Z,
          disableDepthTestDistance: immersive ? 5.0e5 : Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(2.0e4, 1.05, 4.0e6, shaped ? 0.5 : 0.4),
          translucencyByDistance: new NearFarScalar(8.0e3, 1.0, 6.0e6, 0.22),
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
