import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  HeightReference,
  ImageryLayer,
  Ion,
  IonImageryProvider,
  LabelStyle,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  createWorldTerrainAsync,
} from 'cesium'
import { PROTOTYPE_STORM } from '../../config/app'
import type {
  RadarObservation,
  SatelliteObservation,
  StormTrack,
} from '../../weather/types/observations'
import 'cesium/Build/Cesium/Widgets/widgets.css'

export interface GlobePick {
  longitude: number
  latitude: number
}

export interface StormverseGlobe {
  viewer: Viewer
  flyToStorm: (duration?: number) => void
  flyHome: (duration?: number) => void
  flyToCoords: (lon: number, lat: number, height: number, duration?: number) => void
  setRadarFrame: (frame: RadarObservation | null) => void
  setRadarVisible: (visible: boolean) => void
  setSatelliteFrame: (frame: SatelliteObservation | null) => void
  setSatelliteVisible: (visible: boolean) => void
  setTracks: (tracks: StormTrack[], selectedId?: string | null) => void
  setTracksVisible: (visible: boolean) => void
  destroy: () => void
}

export async function createStormverseGlobe(
  container: HTMLElement,
  options: {
    onStormSelect?: () => void
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

  viewer.scene.globe.enableLighting = false
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0a1520')
  viewer.scene.fog.enabled = true
  viewer.scene.globe.showGroundAtmosphere = true
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 2000
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4.0e7
  viewer.clock.shouldAnimate = false
  viewer.resize()
  viewer.scene.requestRender()

  let terrainOk = false

  try {
    if (token) {
      const ionImagery = await IonImageryProvider.fromAssetId(2)
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(ionImagery)
    } else {
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(
        new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        }),
      )
      const layer = viewer.imageryLayers.get(0)
      if (layer) {
        layer.brightness = 0.9
        layer.contrast = 1.05
        layer.saturation = 0.85
      }
    }
  } catch {
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        credit: new Credit('© OpenStreetMap', true),
      }),
    )
  }

  try {
    if (token) {
      viewer.terrainProvider = await createWorldTerrainAsync()
      terrainOk = true
    }
  } catch {
    terrainOk = false
  }

  let radarLayer: ImageryLayer | null = null
  let satelliteLayer: ImageryLayer | null = null
  let radarVisible = true
  let satelliteVisible = false
  let currentRadarUrl: string | null = null
  let currentSatUrl: string | null = null

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
      0.45,
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

  const stormPosition = Cartesian3.fromDegrees(
    PROTOTYPE_STORM.longitude,
    PROTOTYPE_STORM.latitude,
    12000,
  )

  viewer.entities.add({
    id: PROTOTYPE_STORM.id,
    name: PROTOTYPE_STORM.name,
    position: stormPosition,
    point: {
      pixelSize: 14,
      color: Color.fromCssColorString('#e8c27a').withAlpha(0.95),
      outlineColor: Color.WHITE.withAlpha(0.7),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: `${PROTOTYPE_STORM.name}  ·  synthetic reconstruction`,
      font: '12px "IBM Plex Sans", system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -28),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Color.fromCssColorString('#0b1220').withAlpha(0.75),
      backgroundPadding: new Cartesian2(10, 6),
    },
    ellipse: {
      semiMajorAxis: 45000,
      semiMinorAxis: 32000,
      material: Color.fromCssColorString('#c4a35a').withAlpha(0.18),
      height: terrainOk ? undefined : 0,
      heightReference: terrainOk ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
      outline: true,
      outlineColor: Color.fromCssColorString('#e8c27a').withAlpha(0.45),
    },
    description: PROTOTYPE_STORM.description,
  })

  const trackEntityIds = new Set<string>()
  let tracksVisible = true

  const clearTracks = () => {
    for (const id of trackEntityIds) {
      viewer.entities.removeById(id)
    }
    trackEntityIds.clear()
  }

  const setTracks = (tracks: StormTrack[], selectedId: string | null = null) => {
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
          text: `Derived cell · conf ${Math.round((track.confidence ?? 0) * 100)}%`,
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

  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position)
    if (picked && typeof picked === 'object' && 'id' in picked) {
      const entity = (picked as { id?: { id?: string; properties?: { trackId?: { getValue?: () => string } } } }).id
      const entityId = entity?.id
      if (entityId === PROTOTYPE_STORM.id) {
        options.onStormSelect?.()
        return
      }
      const trackProp = entity?.properties?.trackId
      const trackId =
        typeof trackProp?.getValue === 'function' ? trackProp.getValue() : undefined
      if (trackId) {
        options.onTrackSelect?.(trackId)
        return
      }
      // Fallback: parse from entity id
      if (entityId?.startsWith('track-head-') || entityId?.startsWith('track-line-')) {
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
      destination: Cartesian3.fromDegrees(134.0, -26.0, 12_000_000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration,
    })
  }

  const flyToStorm = (duration = 2.4) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        PROTOTYPE_STORM.longitude,
        PROTOTYPE_STORM.latitude - 1.8,
        420_000,
      ),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration,
    })
  }

  const flyToCoords = (lon: number, lat: number, height: number, duration = 1.8) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, height),
      duration,
    })
  }

  flyHome(0)

  return {
    viewer,
    flyToStorm,
    flyHome,
    flyToCoords,
    setRadarFrame,
    setRadarVisible,
    setSatelliteFrame,
    setSatelliteVisible,
    setTracks,
    setTracksVisible,
    destroy: () => {
      clearTracks()
      handler.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
