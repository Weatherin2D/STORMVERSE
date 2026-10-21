import { useMemo, useState } from 'react'
import { Canvas } from './core/Canvas'
import { UIOverlay } from './ui/UIOverlay'
import type { SimParams } from './core/types'

export default function App() {
  const [params, setParams] = useState<SimParams>({
    cloudDetail: 0.7,
    windDrift: 0.24,
    flashFreq: 0.18,
  })
  const [paused, setPaused] = useState(false)
  const [showPanel, setShowPanel] = useState(true)
  const [demoFlash, setDemoFlash] = useState(0)

  const triggerFlash = () => {
    setDemoFlash((v) => v + 1)
  }

  const uiProps = useMemo(
    () => ({
      params,
      setParams,
      paused,
      setPaused,
      showPanel,
      setShowPanel,
      triggerFlash,
    }),
    [params, paused, showPanel],
  )

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas paused={paused} params={params} demoFlashToken={demoFlash} />
      <UIOverlay {...uiProps} />
    </div>
  )
}

