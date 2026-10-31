import { useEffect, useRef } from 'react'
import {
  createStormverseGlobe,
  type StormverseGlobe,
} from '../../rendering/globe/createViewer'
import type {
  LightningObservation,
  RadarObservation,
  SatelliteObservation,
  StormTrack,
} from '../../weather'
import type { ReconstructionTarget } from '../../weather/reconstruction/mapToCloudParams'

interface GlobeViewProps {
  active: boolean
  requestFlyToStorm: number
  requestFlyHome: number
  flyTarget: {
    lon: number
    lat: number
    height: number
    token: number
    oblique?: boolean
  } | null
  onEnterStorm: () => void
  onTrackSelect: (trackId: string) => void
  radarFrame: RadarObservation | null
  satelliteFrame: SatelliteObservation | null
  radarVisible: boolean
  satelliteVisible: boolean
  tracks: StormTrack[]
  tracksVisible: boolean
  selectedTrackId: string | null
  lightningEvents: LightningObservation[]
  lightningVisible: boolean
  volumeTarget: ReconstructionTarget | null
  volumeVisible: boolean
}

export function GlobeView({
  requestFlyToStorm,
  requestFlyHome,
  flyTarget,
  onEnterStorm,
  onTrackSelect,
  radarFrame,
  satelliteFrame,
  radarVisible,
  satelliteVisible,
  tracks,
  tracksVisible,
  selectedTrackId,
  lightningEvents,
  lightningVisible,
  volumeTarget,
  volumeVisible,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<StormverseGlobe | null>(null)
  const onEnterRef = useRef(onEnterStorm)
  const onTrackRef = useRef(onTrackSelect)
  onEnterRef.current = onEnterStorm
  onTrackRef.current = onTrackSelect

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false

    createStormverseGlobe(el, {
      onStormSelect: () => onEnterRef.current(),
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
        if (radarFrame) globe.setRadarFrame(radarFrame)
        if (satelliteFrame) globe.setSatelliteFrame(satelliteFrame)
        globe.setTracks(tracks, selectedTrackId)
        globe.setLightningEvents(lightningEvents)
        if (volumeTarget) globe.setVolumeTarget(volumeTarget)
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
    if (requestFlyToStorm === 0) return
    globeRef.current?.flyToStorm()
  }, [requestFlyToStorm])

  useEffect(() => {
    if (requestFlyHome === 0) return
    globeRef.current?.flyHome()
  }, [requestFlyHome])

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
    globeRef.current?.setRadarFrame(radarFrame)
  }, [radarFrame])

  useEffect(() => {
    globeRef.current?.setSatelliteFrame(satelliteFrame)
  }, [satelliteFrame])

  useEffect(() => {
    globeRef.current?.setRadarVisible(radarVisible)
  }, [radarVisible])

  useEffect(() => {
    globeRef.current?.setSatelliteVisible(satelliteVisible)
  }, [satelliteVisible])

  useEffect(() => {
    globeRef.current?.setTracks(tracks, selectedTrackId)
  }, [tracks, selectedTrackId])

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
    globeRef.current?.setVolumeTarget(volumeTarget)
  }, [volumeTarget])

  useEffect(() => {
    globeRef.current?.setVolumeVisible(volumeVisible)
  }, [volumeVisible])

  return <div ref={containerRef} className="viewport-layer globe-layer" />
}
