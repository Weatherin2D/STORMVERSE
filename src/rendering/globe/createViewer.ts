import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  HeightReference,
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
  destroy: () => void
}

export async function createStormverseGlobe(
  container: HTMLElement,
  options: {
    onStormSelect?: () => void
    onPick?: (pick: GlobePick) => void
  } = {},
): Promise<StormverseGlobe> {
  const token = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim()

  if (token) {
    Ion.defaultAccessToken = token
  }

  const creditHost = document.createElement('div')
  creditHost.style.display = 'none'

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

  // Keep globe readable without a live sun/clock model in Milestone 1.
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
      text: `${PROTOTYPE_STORM.name}  ·  synthetic`,
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

  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position)
    if (
      picked &&
      typeof picked === 'object' &&
      'id' in picked &&
      (picked as { id?: { id?: string } }).id?.id === PROTOTYPE_STORM.id
    ) {
      options.onStormSelect?.()
      return
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
    destroy: () => {
      handler.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
