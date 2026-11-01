import {
  Cartesian2,
  Cartesian3,
  Color,
  HorizontalOrigin,
  VerticalOrigin,
  type Viewer,
} from 'cesium'
import type { CloudFieldPoint } from '../../weather/adapters/cloudCoverGrid'

export interface GlobalCloudFieldHandle {
  setPoints: (points: CloudFieldPoint[]) => void
  setVisible: (visible: boolean) => void
  setImmersiveEmphasis: (immersive: boolean) => void
  destroy: () => void
}

const BAND_COLOR: Record<CloudFieldPoint['band'], string> = {
  low: '#d8dde8',
  mid: '#c5d0e6',
  high: '#eef3ff',
}

/**
 * Globe-scale cloud field as layered billboard/point shells.
 * Driven by model cloud-cover samples — not a per-cloud census or CTH product.
 */
export function createGlobalCloudField(viewer: Viewer): GlobalCloudFieldHandle {
  const ids = new Set<string>()
  let visible = true
  let immersive = false
  let cached: CloudFieldPoint[] = []

  const clear = () => {
    for (const id of ids) viewer.entities.removeById(id)
    ids.clear()
  }

  const rebuild = () => {
    clear()
    if (!visible || cached.length === 0) {
      viewer.scene.requestRender()
      return
    }
    const maxPoints = immersive ? 2200 : 1400
    const sorted = [...cached].sort((a, b) => b.cover - a.cover).slice(0, maxPoints)
    sorted.forEach((p, i) => {
      const id = `cloud-field-${p.band}-${i}-${p.longitude}-${p.latitude}`
      const alpha = Math.min(0.85, 0.18 + p.cover * (immersive ? 0.72 : 0.5))
      const pixel =
        (immersive ? 14 : 9) *
        (0.55 + p.cover) *
        (p.band === 'high' ? 1.15 : p.band === 'mid' ? 1.0 : 0.9)
      viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(p.longitude, p.latitude, p.heightM),
        point: {
          pixelSize: pixel,
          color: Color.fromCssColorString(BAND_COLOR[p.band]).withAlpha(alpha),
          outlineColor: Color.WHITE.withAlpha(0.12),
          outlineWidth: 0,
          disableDepthTestDistance: immersive ? 1.0e6 : Number.POSITIVE_INFINITY,
        },
        label:
          immersive && p.cover > 0.55 && i % 17 === 0
            ? {
                text: p.typeProxy.replace('_proxy', ''),
                font: '10px "IBM Plex Sans", system-ui, sans-serif',
                fillColor: Color.WHITE.withAlpha(0.55),
                showBackground: false,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian2(0, -10),
                disableDepthTestDistance: 2.0e5,
              }
            : undefined,
      })
      ids.add(id)
    })
    viewer.scene.requestRender()
  }

  return {
    setPoints: (points) => {
      cached = points
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
