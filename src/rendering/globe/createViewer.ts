import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  ImageryLayer,
  Ion,
  IonImageryProvider,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  createWorldTerrainAsync,
} from 'cesium'
import { DEFAULT_FOCUS } from '../../config/app'
import type {
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
} from '../../weather/types/observations'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'
import type { CloudFieldPoint } from '../../weather/adapters/cloudCoverGrid'
import { lightningMarkerColor } from '../../weather/reconstruction/lightningQuality'
import {
  createGeoregisteredVolume,
  type GeoregisteredVolumeHandle,
} from './GeoregisteredVolume'
import { createGlobalCloudField, type GlobalCloudFieldHandle } from './GlobalCloudField'
import { createRadarRainShafts, type RadarRainShaftsHandle } from './RadarRainShafts'
import { applySolarClock } from './solarClock'
import type { LightingMode } from '../../lib/lightingMode'
import 'cesium/Build/Cesium/Widgets/widgets.css'

export interface GlobePick {
  longitude: number
  latitude: number
}

export interface StormverseGlobe {
  viewer: Viewer
  flyHome: (duration?: number) => void
  flyToCoords: (
    lon: number,
    lat: number,
    height: number,
    duration?: number,
    oblique?: boolean,
  ) => void
  enterImmersive: (lon: number, lat: number, duration?: number) => void
  exitImmersive: (duration?: number) => void
  setImmersive: (immersive: boolean) => void
  setRadarFrame: (frame: RadarObservation | null) => void
  setRadarVisible: (visible: boolean) => void
  setSatelliteFrame: (frame: SatelliteObservation | null) => void
  setSatelliteVisible: (visible: boolean) => void
  setTracks: (
    tracks: StormTrack[],
    selectedId?: string | null,
    skillById?: Record<string, number>,
  ) => void
  setTracksVisible: (visible: boolean) => void
  setLightningEvents: (events: LightningObservation[]) => void
  setLightningVisible: (visible: boolean) => void
  setLightningEmphasis: (immersive: boolean) => void
  setVolumeTarget: (target: ReconstructionTarget | null) => void
  setVolumeTargets: (targets: ReconstructionTarget[]) => void
  setVolumeVisible: (visible: boolean) => void
  setCloudField: (points: CloudFieldPoint[]) => void
  setCloudsVisible: (visible: boolean) => void
  setPrecipitationVisible: (visible: boolean) => void
  setRainFromTracks: (tracks: StormTrack[], targets?: ReconstructionTarget[]) => void
  setSolarTime: (opts: {
    mode: LightingMode
    observedAt: string | null
    focusLon: number
    focusLat: number
  }) => void
  destroy: () => void
}

export async function createStormverseGlobe(
  container: HTMLElement,
  options: {
    onEnterImmersive?: () => void
    onTrackSelect?: (trackId: string) => void
    onPick?: (pick: GlobePick) => void
  } = {},
): Promise<StormverseGlobe> {
  const token = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim()

  if (token) {
    Ion.defaultAccessToken = token
  }

  const creditHost = document.createElement('div')
  creditHost.className = 'cesium-credit-host'
  creditHost.setAttribute('aria-hidden', 'true')

  const viewer = new Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: creditHost,
    baseLayer: false,
  })

  viewer.scene.globe.enableLighting = true
  viewer.scene.globe.dynamicAtmosphereLighting = true
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0a1520')
  viewer.scene.fog.enabled = true
  viewer.scene.globe.showGroundAtmosphere = true
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 2000
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4.0e7
  viewer.clock.shouldAnimate = false
  viewer.resize()
  viewer.scene.requestRender()

  try {
    if (token) {
      const ionImagery = await IonImageryProvider.fromAssetId(2)
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(ionImagery)
    } else {
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: new Credit('Tiles © Esri', true),
          maximumLevel: 17,
        }),
      )
      const layer = viewer.imageryLayers.get(0)
      if (layer) {
        layer.brightness = 0.95
        layer.contrast = 1.05
        layer.saturation = 0.95
      }
    }
  } catch {
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      }),
    )
  }

  try {
    if (token) {
      viewer.terrainProvider = await createWorldTerrainAsync()
    }
  } catch {
    /* keep ellipsoid */
  }

  let radarLayer: ImageryLayer | null = null
  let satelliteLayer: ImageryLayer | null = null
  let radarVisible = true
  let satelliteVisible = false
  let currentRadarUrl: string | null = null
  let currentSatUrl: string | null = null
  let immersive = false
  let lightningEmphasis = false

  const replaceOverlay = (
    current: ImageryLayer | null,
    url: string | null,
    alpha: number,
    credit: string,
  ): ImageryLayer | null => {
    if (current) {
      viewer.imageryLayers.remove(current, true)
    }
    if (!url) return null
    const provider = new UrlTemplateImageryProvider({
      url,
      credit: new Credit(credit, true),
      maximumLevel: 12,
    })
    const layer = viewer.imageryLayers.addImageryProvider(provider)
    layer.alpha = alpha
    layer.show = true
    viewer.scene.requestRender()
    return layer
  }

  const setRadarFrame = (frame: RadarObservation | null) => {
    const url = frame?.available ? frame.tileUrlTemplate ?? null : null
    if (url === currentRadarUrl && radarLayer) {
      radarLayer.show = radarVisible
      return
    }
    currentRadarUrl = url
    radarLayer = replaceOverlay(
      radarLayer,
      radarVisible ? url : null,
      0.72,
      frame?.provenance.summary ?? 'Radar',
    )
    if (radarLayer) radarLayer.show = radarVisible
  }

  const setRadarVisible = (visible: boolean) => {
    radarVisible = visible
    if (radarLayer) {
      radarLayer.show = visible
      viewer.scene.requestRender()
      return
    }
    if (visible && currentRadarUrl) {
      radarLayer = replaceOverlay(null, currentRadarUrl, 0.72, 'Radar © RainViewer')
    }
  }

  const setSatelliteFrame = (frame: SatelliteObservation | null) => {
    const url = frame?.available ? frame.tileUrlTemplate ?? null : null
    if (url === currentSatUrl && satelliteLayer) {
      satelliteLayer.show = satelliteVisible
      return
    }
    currentSatUrl = url
    satelliteLayer = replaceOverlay(
      satelliteLayer,
      satelliteVisible ? url : null,
      immersive ? 0.55 : 0.45,
      frame?.provenance.summary ?? 'Satellite',
    )
    if (satelliteLayer) satelliteLayer.show = satelliteVisible
  }

  const setSatelliteVisible = (visible: boolean) => {
    satelliteVisible = visible
    if (satelliteLayer) {
      satelliteLayer.show = visible
      viewer.scene.requestRender()
      return
    }
    if (visible && currentSatUrl) {
      satelliteLayer = replaceOverlay(null, currentSatUrl, 0.45, 'Satellite © RainViewer')
    }
  }

  const trackEntityIds = new Set<string>()
  let tracksVisible = true
  let lastTracks: StormTrack[] = []

  const clearTracks = () => {
    for (const id of trackEntityIds) {
      viewer.entities.removeById(id)
    }
    trackEntityIds.clear()
  }

  const setTracks = (
    tracks: StormTrack[],
    selectedId: string | null = null,
    skillById: Record<string, number> = {},
  ) => {
    lastTracks = tracks
    clearTracks()
    if (!tracksVisible) return
    for (const track of tracks) {
      if (!track.available || track.points.length < 2) continue
      const positions = track.points.map((p) =>
        Cartesian3.fromDegrees(p.longitude, p.latitude, 8000),
      )
      const selected = track.id === selectedId
      const lineId = `track-line-${track.id}`
      const head = track.points[track.points.length - 1]
      const headId = `track-head-${track.id}`
      const skill = skillById[track.id]
      const skillNote = skill != null ? ` · skill ${Math.round(skill * 100)}%` : ''
      viewer.entities.add({
        id: lineId,
        name: track.stormId,
        polyline: {
          positions,
          width: selected ? 4 : 2.5,
          material: Color.fromCssColorString(selected ? '#f0c56d' : '#7eb6ff').withAlpha(
            selected ? 0.95 : 0.75,
          ),
          clampToGround: false,
        },
        properties: { trackId: track.id },
      })
      viewer.entities.add({
        id: headId,
        position: Cartesian3.fromDegrees(head.longitude, head.latitude, 9000),
        point: {
          pixelSize: selected ? 12 : 8,
          color: Color.fromCssColorString(selected ? '#f0c56d' : '#9ec5ff'),
          outlineColor: Color.BLACK.withAlpha(0.5),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `Derived cell · conf ${Math.round((track.confidence ?? 0) * 100)}%${skillNote}`,
          font: '11px "IBM Plex Sans", system-ui, sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#0b1220').withAlpha(0.7),
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: selected ? 1 : 0.9,
        },
        properties: { trackId: track.id },
      })
      trackEntityIds.add(lineId)
      trackEntityIds.add(headId)
    }
    viewer.scene.requestRender()
  }

  const setTracksVisible = (visible: boolean) => {
    tracksVisible = visible
    for (const id of trackEntityIds) {
      const ent = viewer.entities.getById(id)
      if (ent) ent.show = visible
    }
    viewer.scene.requestRender()
  }

  const lightningEntityIds = new Set<string>()
  let lightningVisible = true
  let cachedLightning: LightningObservation[] = []

  const clearLightning = () => {
    for (const id of lightningEntityIds) viewer.entities.removeById(id)
    lightningEntityIds.clear()
  }

  const setLightningEvents = (events: LightningObservation[]) => {
    cachedLightning = events
    clearLightning()
    if (!lightningVisible) return
    for (const ev of events.slice(0, 500)) {
      const id = `lght-${ev.id}`
      const fill = lightningMarkerColor(ev)
      const base =
        ev.classification === 'cloud_to_ground'
          ? 7
          : ev.qualityScore != null && ev.qualityScore >= 0.75
            ? 6
            : 4
      const size = lightningEmphasis ? base * 1.55 : base
      viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(ev.longitude, ev.latitude, ev.altitudeM ?? 6000),
        point: {
          pixelSize: size,
          color: Color.fromCssColorString(fill).withAlpha(lightningEmphasis ? 0.98 : 0.92),
          outlineColor: Color.fromCssColorString('#fff8d0').withAlpha(
            lightningEmphasis ? 0.75 : 0.45,
          ),
          outlineWidth: lightningEmphasis ? 2 : 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      lightningEntityIds.add(id)
    }
    viewer.scene.requestRender()
  }

  const setLightningVisible = (visible: boolean) => {
    lightningVisible = visible
    if (!visible) {
      for (const id of lightningEntityIds) {
        const ent = viewer.entities.getById(id)
        if (ent) ent.show = false
      }
      viewer.scene.requestRender()
      return
    }
    if (lightningEntityIds.size === 0 && cachedLightning.length > 0) {
      setLightningEvents(cachedLightning)
      return
    }
    for (const id of lightningEntityIds) {
      const ent = viewer.entities.getById(id)
      if (ent) ent.show = true
    }
    viewer.scene.requestRender()
  }

  const volume: GeoregisteredVolumeHandle = createGeoregisteredVolume(viewer)
  const clouds: GlobalCloudFieldHandle = createGlobalCloudField(viewer)
  const rain: RadarRainShaftsHandle = createRadarRainShafts(viewer)
  let lastVolumeTargets: ReconstructionTarget[] = []

  const applyImmersiveCameraController = (on: boolean) => {
    const ssc = viewer.scene.screenSpaceCameraController
    ssc.minimumZoomDistance = on ? 120 : 2000
    ssc.maximumZoomDistance = on ? 2.5e7 : 4.0e7
    ssc.enableCollisionDetection = !on
    clouds.setImmersiveEmphasis(on)
  }

  const setImmersive = (on: boolean) => {
    immersive = on
    lightningEmphasis = on
    applyImmersiveCameraController(on)
    if (cachedLightning.length > 0) setLightningEvents(cachedLightning)
  }

  const enterImmersive = (lon: number, lat: number, duration = 2.2) => {
    setImmersive(true)
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat - 0.35, 28_000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-18),
        roll: 0,
      },
      duration,
    })
  }

  const exitImmersive = (duration = 2.0) => {
    setImmersive(false)
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        DEFAULT_FOCUS.longitude,
        DEFAULT_FOCUS.latitude,
        12_000_000,
      ),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration,
    })
  }

  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position)
    if (picked && typeof picked === 'object' && 'id' in picked) {
      const rawId = (picked as { id?: unknown }).id
      if (typeof rawId === 'string' && rawId.startsWith('stormverse-vol-')) {
        options.onEnterImmersive?.()
        return
      }
      const entity = (
        picked as {
          id?: { id?: string; properties?: { trackId?: { getValue?: () => string } } }
        }
      ).id
      const entityId = typeof entity === 'string' ? entity : entity?.id
      if (typeof entityId === 'string' && entityId.startsWith('stormverse-vol-')) {
        options.onEnterImmersive?.()
        return
      }
      const trackProp = typeof entity === 'object' ? entity?.properties?.trackId : undefined
      const trackId =
        typeof trackProp?.getValue === 'function' ? trackProp.getValue() : undefined
      if (trackId) {
        options.onTrackSelect?.(trackId)
        return
      }
      if (
        typeof entityId === 'string' &&
        (entityId.startsWith('track-head-') || entityId.startsWith('track-line-'))
      ) {
        options.onTrackSelect?.(entityId.replace(/^track-(head|line)-/, ''))
        return
      }
    }
    const cartesian = viewer.camera.pickEllipsoid(
      movement.position,
      viewer.scene.globe.ellipsoid,
    )
    if (cartesian) {
      const carto = Cartographic.fromCartesian(cartesian)
      options.onPick?.({
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
      })
    }
  }, ScreenSpaceEventType.LEFT_CLICK)

  const flyHome = (duration = 2.2) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        DEFAULT_FOCUS.longitude,
        DEFAULT_FOCUS.latitude,
        12_000_000,
      ),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration,
    })
  }

  const flyToCoords = (
    lon: number,
    lat: number,
    height: number,
    duration = 1.8,
    oblique = false,
  ) => {
    if (oblique) {
      const offsetDeg = Math.max(0.55, height / 280_000)
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat - offsetDeg, height),
        orientation: {
          heading: 0,
          pitch: CesiumMath.toRadians(-32),
          roll: 0,
        },
        duration,
      })
      return
    }
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, height),
      duration,
    })
  }

  flyHome(0)

  return {
    viewer,
    flyHome,
    flyToCoords,
    enterImmersive,
    exitImmersive,
    setImmersive,
    setRadarFrame,
    setRadarVisible,
    setSatelliteFrame,
    setSatelliteVisible,
    setTracks,
    setTracksVisible,
    setLightningEvents,
    setLightningVisible,
    setLightningEmphasis: (on) => {
      lightningEmphasis = on
      if (cachedLightning.length > 0) setLightningEvents(cachedLightning)
    },
    setVolumeTarget: (target) => {
      lastVolumeTargets = target ? [target] : []
      volume.setTarget(target)
      rain.setFromTracks(lastTracks, lastVolumeTargets)
    },
    setVolumeTargets: (targets) => {
      lastVolumeTargets = targets
      volume.setTargets(targets)
      rain.setFromTracks(lastTracks, lastVolumeTargets)
    },
    setVolumeVisible: (v) => volume.setVisible(v),
    setCloudField: (points) => clouds.setPoints(points),
    setCloudsVisible: (v) => clouds.setVisible(v),
    setPrecipitationVisible: (v) => rain.setVisible(v),
    setRainFromTracks: (tracks, targets) => {
      lastTracks = tracks
      if (targets) lastVolumeTargets = targets
      rain.setFromTracks(tracks, lastVolumeTargets)
    },
    setSolarTime: (opts) => applySolarClock(viewer, opts),
    destroy: () => {
      volume.destroy()
      clouds.destroy()
      rain.destroy()
      clearTracks()
      clearLightning()
      handler.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
