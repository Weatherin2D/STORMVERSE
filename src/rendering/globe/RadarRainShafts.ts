import { Cartesian3, Color, type Viewer } from 'cesium'
import type { StormTrack } from '../../weather/types/observations'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'

export interface RadarRainShaftsHandle {
  setFromTracks: (tracks: StormTrack[], targets?: ReconstructionTarget[]) => void
  setVisible: (visible: boolean) => void
  destroy: () => void
}

/**
 * Vertical precip shaft cues at derived cell heads.
 * Derived from RainViewer-driven tracks / reconstruction — not measured radar volumes.
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
      .slice(0, 48)

    shafts.forEach((track, i) => {
      const head = track.points[track.points.length - 1]
      const recon = byStorm.get(track.id)
      const conf = track.confidence ?? 0.35
      const cape = recon?.drivers.capeJkg ?? 400
      const intens = Math.min(1, 0.35 * conf + 0.65 * Math.min(1, cape / 2500))
      if (intens < 0.28) return

      const topM = 2500 + intens * 9000
      const id = `rain-shaft-${track.id}-${i}`
      viewer.entities.add({
        id,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(head.longitude, head.latitude, 200),
            Cartesian3.fromDegrees(head.longitude, head.latitude, topM),
          ],
          width: 2 + intens * 4,
          material: Color.fromCssColorString('#7ec8ff').withAlpha(0.25 + intens * 0.45),
          clampToGround: false,
        },
      })
      ids.add(id)

      // Soft ground puddle cue
      const puddleId = `${id}-puddle`
      viewer.entities.add({
        id: puddleId,
        position: Cartesian3.fromDegrees(head.longitude, head.latitude, 0),
        ellipse: {
          semiMajorAxis: 8000 + intens * 18000,
          semiMinorAxis: 6000 + intens * 14000,
          material: Color.fromCssColorString('#5aa0d8').withAlpha(0.08 + intens * 0.12),
          height: 0,
          outline: false,
        },
      })
      ids.add(puddleId)
    })
    viewer.scene.requestRender()
  }

  return {
    setFromTracks: (tracks, targets = []) => {
      lastTracks = tracks
      lastTargets = targets
      rebuild()
    },
    setVisible: (v) => {
      visible = v
      rebuild()
    },
    destroy: () => clear(),
  }
}
