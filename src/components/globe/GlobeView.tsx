import { useEffect, useRef } from 'react'
import {
  createStormverseGlobe,
  type StormverseGlobe,
} from '../../rendering/globe/createViewer'
import type { RadarObservation, SatelliteObservation } from '../../weather'

interface GlobeViewProps {
  active: boolean
  requestFlyToStorm: number
  requestFlyHome: number
  onEnterStorm: () => void
  radarFrame: RadarObservation | null
  satelliteFrame: SatelliteObservation | null
  radarVisible: boolean
  satelliteVisible: boolean
}

export function GlobeView({
  requestFlyToStorm,
  requestFlyHome,
  onEnterStorm,
  radarFrame,
  satelliteFrame,
  radarVisible,
  satelliteVisible,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<StormverseGlobe | null>(null)
  const onEnterRef = useRef(onEnterStorm)
  onEnterRef.current = onEnterStorm

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false

    createStormverseGlobe(el, {
      onStormSelect: () => onEnterRef.current(),
    })
      .then((globe) => {
        if (cancelled) {
          globe.destroy()
          return
        }
        globeRef.current = globe
        globe.setRadarVisible(radarVisible)
        globe.setSatelliteVisible(satelliteVisible)
        if (radarFrame) globe.setRadarFrame(radarFrame)
        if (satelliteFrame) globe.setSatelliteFrame(satelliteFrame)
      })
      .catch((err) => {
        console.error('Failed to initialise Cesium globe', err)
      })

    return () => {
      cancelled = true
      globeRef.current?.destroy()
      globeRef.current = null
    }
    // Mount once; layer updates flow through later effects.
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

  return <div ref={containerRef} className="viewport-layer globe-layer" />
}
