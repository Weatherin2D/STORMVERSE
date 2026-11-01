import { useEffect, useRef } from 'react'
import {
  createStormverseGlobe,
  type StormverseGlobe,
} from '../../rendering/globe/createViewer'
import type {
  CloudFieldPoint,
  ImageryCloudTile,
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
} from '../../weather'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'
import type { LightingMode } from '../../lib/lightingMode'

interface GlobeViewProps {
  active: boolean
  immersive: boolean
  requestFlyHome: number
  requestEnterImmersive: number
  immersiveFocus: { lon: number; lat: number } | null
  flyTarget: {
    lon: number
    lat: number
    height: number
    token: number
    oblique?: boolean
  } | null
  onEnterImmersive: () => void
  onTrackSelect: (trackId: string) => void
  radarFrame: RadarObservation | null
  satelliteFrame: SatelliteObservation | null
  radarVisible: boolean
  satelliteVisible: boolean
  tracks: StormTrack[]
  tracksVisible: boolean
  selectedTrackId: string | null
  trackSkillById: Record<string, number>
  lightningEvents: LightningObservation[]
  lightningVisible: boolean
  volumeTarget: ReconstructionTarget | null
  volumeTargets: ReconstructionTarget[]
  volumeVisible: boolean
  cloudField: CloudFieldPoint[]
  cloudTiles: ImageryCloudTile[]
  cloudsVisible: boolean
  precipitationVisible: boolean
  lightingMode: LightingMode
  observedAt: string | null
  focusLon: number
  focusLat: number
}

export function GlobeView({
  immersive,
  requestFlyHome,
  requestEnterImmersive,
  immersiveFocus,
  flyTarget,
  onEnterImmersive,
  onTrackSelect,
  radarFrame,
  satelliteFrame,
  radarVisible,
  satelliteVisible,
  tracks,
  tracksVisible,
  selectedTrackId,
  trackSkillById,
  lightningEvents,
  lightningVisible,
  volumeTarget,
  volumeTargets,
  volumeVisible,
  cloudField,
  cloudTiles,
  cloudsVisible,
  precipitationVisible,
  lightingMode,
  observedAt,
  focusLon,
  focusLat,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<StormverseGlobe | null>(null)
  const onEnterRef = useRef(onEnterImmersive)
  const onTrackRef = useRef(onTrackSelect)
  onEnterRef.current = onEnterImmersive
  onTrackRef.current = onTrackSelect

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false

    createStormverseGlobe(el, {
      onEnterImmersive: () => onEnterRef.current(),
      onTrackSelect: (id) => onTrackRef.current(id),
    })
      .then((globe) => {
        if (cancelled) {
          globe.destroy()
          return
        }
        globeRef.current = globe
        globe.setRadarVisible(radarVisible)
        globe.setSatelliteVisible(satelliteVisible)
        globe.setTracksVisible(tracksVisible)
        globe.setLightningVisible(lightningVisible)
        globe.setVolumeVisible(volumeVisible)
        globe.setCloudsVisible(cloudsVisible)
        globe.setPrecipitationVisible(precipitationVisible)
        if (radarFrame) globe.setRadarFrame(radarFrame)
        if (satelliteFrame) globe.setSatelliteFrame(satelliteFrame)
        globe.setTracks(tracks, selectedTrackId, trackSkillById)
        globe.setLightningEvents(lightningEvents)
        if (volumeTargets.length > 0) globe.setVolumeTargets(volumeTargets)
        else if (volumeTarget) globe.setVolumeTarget(volumeTarget)
        globe.setCloudField({ points: cloudField, tiles: cloudTiles })
        globe.setRainFromTracks(tracks, volumeTargets)
        globe.setSolarTime({ mode: lightingMode, observedAt, focusLon, focusLat })
        globe.setImmersive(immersive)
      })
      .catch((err) => {
        console.error('Failed to initialise Cesium globe', err)
      })

    return () => {
      cancelled = true
      globeRef.current?.destroy()
      globeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (requestFlyHome === 0) return
    globeRef.current?.exitImmersive(2.0)
  }, [requestFlyHome])

  useEffect(() => {
    if (requestEnterImmersive === 0 || !immersiveFocus) return
    globeRef.current?.enterImmersive(immersiveFocus.lon, immersiveFocus.lat)
  }, [requestEnterImmersive, immersiveFocus])

  useEffect(() => {
    if (!flyTarget || flyTarget.token === 0) return
    globeRef.current?.flyToCoords(
      flyTarget.lon,
      flyTarget.lat,
      flyTarget.height,
      1.8,
      flyTarget.oblique,
    )
  }, [flyTarget])

  useEffect(() => {
    globeRef.current?.setImmersive(immersive)
  }, [immersive])

  useEffect(() => {
    globeRef.current?.setRadarFrame(radarFrame)
  }, [radarFrame])

  useEffect(() => {
    globeRef.current?.setRadarVisible(radarVisible)
  }, [radarVisible])

  useEffect(() => {
    globeRef.current?.setSatelliteFrame(satelliteFrame)
  }, [satelliteFrame])

  useEffect(() => {
    globeRef.current?.setSatelliteVisible(satelliteVisible)
  }, [satelliteVisible])

  useEffect(() => {
    globeRef.current?.setTracks(tracks, selectedTrackId, trackSkillById)
    globeRef.current?.setRainFromTracks(tracks, volumeTargets)
  }, [tracks, selectedTrackId, trackSkillById, volumeTargets])

  useEffect(() => {
    globeRef.current?.setTracksVisible(tracksVisible)
  }, [tracksVisible])

  useEffect(() => {
    globeRef.current?.setLightningEvents(lightningEvents)
  }, [lightningEvents])

  useEffect(() => {
    globeRef.current?.setLightningVisible(lightningVisible)
  }, [lightningVisible])

  useEffect(() => {
    if (volumeTargets.length > 0) globeRef.current?.setVolumeTargets(volumeTargets)
    else globeRef.current?.setVolumeTarget(volumeTarget)
  }, [volumeTarget, volumeTargets])

  useEffect(() => {
    globeRef.current?.setVolumeVisible(volumeVisible)
  }, [volumeVisible])

  useEffect(() => {
    globeRef.current?.setCloudField({ points: cloudField, tiles: cloudTiles })
  }, [cloudField, cloudTiles])

  useEffect(() => {
    globeRef.current?.setCloudsVisible(cloudsVisible)
  }, [cloudsVisible])

  useEffect(() => {
    globeRef.current?.setPrecipitationVisible(precipitationVisible)
  }, [precipitationVisible])

  useEffect(() => {
    globeRef.current?.setSolarTime({ mode: lightingMode, observedAt, focusLon, focusLat })
  }, [lightingMode, observedAt, focusLon, focusLat])

  return <div className={`globe-root${immersive ? ' immersive' : ''}`} ref={containerRef} />
}
