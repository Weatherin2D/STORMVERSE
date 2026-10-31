import { useEffect, useRef } from 'react'
import {
  createStormverseGlobe,
  type StormverseGlobe,
} from '../../rendering/globe/createViewer'

interface GlobeViewProps {
  active: boolean
  requestFlyToStorm: number
  requestFlyHome: number
  onEnterStorm: () => void
}

export function GlobeView({
  requestFlyToStorm,
  requestFlyHome,
  onEnterStorm,
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
      })
      .catch((err) => {
        console.error('Failed to initialise Cesium globe', err)
      })

    return () => {
      cancelled = true
      globeRef.current?.destroy()
      globeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (requestFlyToStorm === 0) return
    globeRef.current?.flyToStorm()
  }, [requestFlyToStorm])

  useEffect(() => {
    if (requestFlyHome === 0) return
    globeRef.current?.flyHome()
  }, [requestFlyHome])

  return <div ref={containerRef} className="viewport-layer globe-layer" />
}
