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
  low: [220, 226, 236],
  mid: [210, 218, 232],
  high: [236, 242, 255],
}

function makeCloudTexture(seed: number): HTMLCanvasElement {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const blobs = 7 + (seed % 4)
  for (let i = 0; i < blobs; i++) {
    const t = (i + 1) / blobs
    const cx = size * (0.28 + ((seed * 17 + i * 37) % 100) / 220)
    const cy = size * (0.3 + ((seed * 29 + i * 19) % 100) / 200)
    const r = size * (0.22 + t * 0.28)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, `rgba(255,255,255,${0.55 - t * 0.25})`)
    g.addColorStop(0.45, `rgba(235,240,250,${0.28 - t * 0.12})`)
    g.addColorStop(1, 'rgba(200,210,230,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(
    size / 2,
    size * 0.52,
    size * 0.05,
    size / 2,
    size * 0.48,
    size * 0.5,
  )
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.7, 'rgba(0,0,0,0.85)')
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

function cloudVolumeFragment(
  dims: { width: number; depth: number; height: number },
  inverseModel: Matrix4,
  density: number,
  tint: [number, number, number],
): string {
  const hx = (dims.width * 0.5).toFixed(1)
  const hy = (dims.height * 0.5).toFixed(1)
  const hz = (dims.depth * 0.5).toFixed(1)
  const inv = mat4Glsl(inverseModel)
  const [tr, tg, tb] = tint.map((c) => (c / 255).toFixed(3))
  const d = density.toFixed(3)
  return /* glsl */ `
in vec3 v_positionWC;
const vec3 u_half = vec3(${hx}, ${hy}, ${hz});
const float u_density = ${d};
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
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
float cloudDensity(vec3 local) {
  vec3 q = local / (u_half * 2.0);
  float h = q.y;
  float radial = length(q.xz);
  float dome = 1.0 - smoothstep(0.15, 0.48, radial);
  dome *= smoothstep(-0.48, -0.28, h) * (1.0 - smoothstep(0.05, 0.48, h));
  float tower = 1.0 - smoothstep(0.08, 0.22, length(q.xz));
  tower *= smoothstep(-0.45, -0.2, h) * (1.0 - smoothstep(0.15, 0.5, h));
  float body = max(dome, tower * 0.95);
  body *= mix(0.55, 1.2, fbm(q * 3.2 + vec3(0.1, 0.05, -0.08)));
  return clamp(body * u_density, 0.0, 1.4);
}
void main() {
  vec4 localH = u_inverseModel * vec4(v_positionWC, 1.0);
  vec3 local = localH.xyz;
  vec3 camLocal = (u_inverseModel * vec4(czm_viewerPositionWC, 1.0)).xyz;
  vec3 rd = normalize(local - camLocal);
  vec3 ro = camLocal;
  float tMin = 0.0;
  float tMax = length(u_half) * 2.8;
  vec3 invRd = 1.0 / max(abs(rd), vec3(1e-4));
  vec3 t0 = (-u_half - ro) * sign(rd) * invRd;
  vec3 t1 = ( u_half - ro) * sign(rd) * invRd;
  vec3 tsm = min(t0, t1);
  vec3 tlg = max(t0, t1);
  tMin = max(max(tsm.x, tsm.y), tsm.z);
  tMax = min(min(tlg.x, tlg.y), tlg.z);
  if (tMax < max(tMin, 0.0)) discard;
  tMin = max(tMin, 0.0);
  float stepSize = (tMax - tMin) / 28.0;
  vec4 acc = vec4(0.0);
  float t = tMin;
  for (int i = 0; i < 28; i++) {
    vec3 p = ro + rd * t;
    float d = cloudDensity(p);
    if (d > 0.02) {
      float light = 0.45 + 0.55 * clamp((p.y / u_half.y) * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(u_tint * 0.55, vec3(1.0), light);
      float a = (1.0 - exp(-d * 1.35)) * 0.22;
      acc.rgb += (1.0 - acc.a) * a * col;
      acc.a += (1.0 - acc.a) * a;
      if (acc.a > 0.92) break;
    }
    t += stepSize;
    if (t > tMax) break;
  }
  if (acc.a < 0.02) discard;
  out_FragColor = vec4(acc.rgb, acc.a);
}
`
}

/**
 * Imagery-shaped cloud masses: mosaic-textured altitude sheets (exact footprint)
 * plus dense overlapping billboards only where imagery has signal.
 */
export function createGlobalCloudField(viewer: Viewer): GlobalCloudFieldHandle {
  const textures = [0, 1, 2, 3].map((s) => makeCloudTexture(s + 11))
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
    // Fewer altitude layers when the globe is packed with tiles (perf).
    const layers = cachedTiles.length > 80 ? (immersive ? 3 : 2) : immersive ? 5 : 4
    const span = Math.max(800, tile.topHeightM - tile.baseHeightM)
    const alpha = Math.min(0.78, 0.28 + tile.meanIntensity * 0.55)
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
            color: Color.fromBytes(255, 255, 255, Math.floor(alpha * 255 * (0.7 + t * 0.3))),
          }),
        },
      })
      sheetEntityIds.push(id)
    }
  }

  const addVolume = (p: CloudFieldPoint) => {
    const width = Math.max(8_000, (p.horizontalScaleM || 24_000) * 1.1)
    const depth = width * 0.9
    const height = Math.max(3_000, p.thicknessM)
    const dims = { width, depth, height }
    const base = Math.max(400, p.heightM - height * 0.45)
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
    const density = 0.55 + (p.volumeStrength || p.cover) * 0.7
    const appearance = new Appearance({
      translucent: true,
      closed: true,
      renderState: {
        blending: BlendingState.ALPHA_BLEND,
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: true, face: 1028 },
      },
      fragmentShaderSource: cloudVolumeFragment(dims, inverse, density, tint),
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
    // Mosaic-textured altitude sheets for every tile with signal (Earth-wide).
    if (shaped) {
      const maxTiles = immersive ? 280 : 220
      // Prefer stronger tiles first but keep nearly the full globe.
      cachedTiles
        .slice()
        .sort((a, b) => b.meanIntensity - a.meanIntensity)
        .slice(0, maxTiles)
        .forEach((tile, i) => addSheets(tile, i))
    }

    // Dense in-shape fill worldwide; model fallback stays sparser.
    const maxBillboardCells = shaped
      ? immersive
        ? 6500
        : 5000
      : immersive
        ? 900
        : 700
    const maxVolumes = shaped ? (immersive ? 48 : 32) : immersive ? 48 : 28
    const sorted = [...cached].sort(
      (a, b) => (b.volumeStrength || b.cover) - (a.volumeStrength || a.cover),
    )
    const cells = sorted.slice(0, maxBillboardCells)

    billboards = new BillboardCollection({ scene: viewer.scene })
    viewer.scene.primitives.add(billboards)

    cells.forEach((p, i) => {
      const pixelScale = p.horizontalScaleM || 24_000
      // Imagery fill uses ~pixel footprint; model points keep larger masses.
      const scale = shaped
        ? Math.max(1_800, pixelScale) * (immersive ? 1.35 : 1.2)
        : Math.max(10_000, pixelScale) * (immersive ? 1.15 : 1)
      const baseH = Math.max(600, p.heightM - p.thicknessM * 0.35)
      const thick = Math.max(2_000, p.thicknessM)
      const layers = shaped
        ? cells.length > 2500
          ? Math.min(2, 1 + Math.floor(p.cover * 1.5))
          : Math.min(3, 2 + Math.floor(p.cover * 1.5))
        : Math.min(8, 3 + Math.floor(p.cover * 5))
      const [r, g, b] = BAND_RGB[p.band]
      const alpha = Math.min(0.9, 0.22 + p.cover * 0.55 + (immersive ? 0.08 : 0))

      const metersToDegLat = 1 / 111_320
      const metersToDegLon =
        1 / (111_320 * Math.max(0.2, Math.cos((p.latitude * Math.PI) / 180)))

      for (let L = 0; L < layers; L++) {
        const t = layers === 1 ? 0.5 : L / (layers - 1)
        const h = baseH + t * thick
        // Tiny lateral jitter only — keep mass inside the mosaic silhouette.
        const ang = (i * 1.7 + L * 2.3) % (Math.PI * 2)
        const radM = scale * (shaped ? 0.04 : 0.12) * (0.35 + (L % 3) * 0.25)
        const east = radM * Math.cos(ang)
        const north = radM * Math.sin(ang)
        const lon = p.longitude + east * metersToDegLon
        const lat = p.latitude + north * metersToDegLat

        const size = shaped
          ? scale * (0.95 + (1 - Math.abs(t - 0.45)) * 0.25)
          : scale * (0.55 + (1 - Math.abs(t - 0.45)) * 0.55) * (0.75 + p.cover * 0.4)
        billboards!.add({
          position: Cartesian3.fromDegrees(lon, lat, h),
          image: textures[(i + L) % textures.length],
          width: size,
          height: size * (shaped ? 0.48 + (1 - t) * 0.2 : 0.55 + (1 - t) * 0.25),
          sizeInMeters: true,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          color: Color.fromBytes(r, g, b, Math.floor(alpha * 255 * (0.75 + t * 0.25))),
          alignedAxis: Cartesian3.UNIT_Z,
          disableDepthTestDistance: immersive ? 5.0e5 : Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(2.0e4, 1.1, 4.0e6, shaped ? 0.45 : 0.35),
          translucencyByDistance: new NearFarScalar(8.0e3, 1.0, 6.0e6, 0.25),
        })
      }
    })

    sorted.slice(0, maxVolumes).forEach((p) => {
      if ((p.volumeStrength || p.cover) < (shaped ? 0.45 : 0.35)) return
      // Keep volumes tight to the footprint when shaped.
      if (shaped && (p.horizontalScaleM || 0) > 0) {
        const tight = { ...p, horizontalScaleM: Math.min(p.horizontalScaleM || 12_000, 18_000) }
        addVolume(tight)
        return
      }
      addVolume(p)
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
