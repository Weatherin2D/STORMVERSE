import { Cartesian3, Color, type Viewer } from 'cesium'
import type { StormTrack } from '../../weather/types/observations'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'

export interface RadarRainShaftsHandle {
  setFromTracks: (tracks: StormTrack[], targets?: ReconstructionTarget[]) => void
  setVisible: (visible: boolean) => void
  destroy: () => void
}

/**
 * Soft volumetric rain-curtain cues under derived cell heads
 * (MeteoLab-like precip shafts — derived, not measured RHI volumes).
 */
export function createRadarRainShafts(viewer: Viewer): RadarRainShaftsHandle {
  const ids = new Set<string>()
  let visible = true
  let lastTracks: StormTrack[] = []
  let lastTargets: ReconstructionTarget[] = []

  const clear = () => {
    for (const id of ids) viewer.entities.removeById(id)
    ids.clear()
  }

  const rebuild = () => {
    clear()
    if (!visible) {
      viewer.scene.requestRender()
      return
    }
    const byStorm = new Map<string, ReconstructionTarget>()
    for (const t of lastTargets) byStorm.set(t.id, t)

    const shafts = lastTracks
      .filter((t) => t.available && t.points.length > 0)
      .slice(0, 56)

    shafts.forEach((track, i) => {
      const head = track.points[track.points.length - 1]
      const recon = byStorm.get(track.id)
      const conf = track.confidence ?? 0.35
      const cape = recon?.drivers.capeJkg ?? 400
      const intens = Math.min(1, 0.35 * conf + 0.65 * Math.min(1, cape / 2500))
      if (intens < 0.26) return

      const topM = 1800 + intens * 10_500
      const major = 6_000 + intens * 22_000
      const minor = 4_500 + intens * 16_000
      const id = `rain-shaft-${track.id}-${i}`

      // Soft translucent curtain column (ellipse extruded in height layers).
      const layers = 5
      for (let L = 0; L < layers; L++) {
        const t = L / (layers - 1)
        const h = 80 + t * topM
        const fade = 1.0 - Math.abs(t - 0.45) * 0.55
        const layerId = `${id}-L${L}`
        viewer.entities.add({
          id: layerId,
          position: Cartesian3.fromDegrees(head.longitude, head.latitude, h),
          ellipse: {
            semiMajorAxis: major * (0.75 + t * 0.35),
            semiMinorAxis: minor * (0.75 + t * 0.35),
            material: Color.fromBytes(
              150,
              168,
              188,
              Math.floor((0.07 + intens * 0.16) * fade * 255),
            ),
            height: h,
            heightReference: undefined,
            outline: false,
          },
        })
        ids.add(layerId)
      }

      // Vertical streak cues for reading shafts at distance.
      const streakId = `${id}-streak`
      viewer.entities.add({
        id: streakId,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(head.longitude, head.latitude, 120),
            Cartesian3.fromDegrees(head.longitude, head.latitude, topM),
          ],
          width: 3 + intens * 6,
          material: Color.fromBytes(170, 190, 210, Math.floor((0.18 + intens * 0.35) * 255)),
          clampToGround: false,
        },
      })
      ids.add(streakId)

      const puddleId = `${id}-puddle`
      viewer.entities.add({
        id: puddleId,
        position: Cartesian3.fromDegrees(head.longitude, head.latitude, 0),
        ellipse: {
          semiMajorAxis: major * 1.05,
          semiMinorAxis: minor * 1.05,
          material: Color.fromBytes(90, 130, 170, Math.floor((0.06 + intens * 0.1) * 255)),
          height: 0,
          outline: false,
        },
      })
      ids.add(puddleId)
    })
    viewer.scene.requestRender()
  }

  return {
    setFromTracks: (tracks, targets) => {
      lastTracks = tracks
      if (targets) lastTargets = targets
      rebuild()
    },
    setVisible: (v) => {
      visible = v
      rebuild()
    },
    destroy: () => clear(),
  }
}
