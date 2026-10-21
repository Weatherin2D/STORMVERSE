import { useState } from 'react'
import type { SimParams } from '../core/types'

interface UIOverlayProps {
  params: SimParams
  setParams: (p: SimParams) => void
  paused: boolean
  setPaused: (p: boolean) => void
  showPanel: boolean
  setShowPanel: (p: boolean) => void
  triggerFlash: () => void
}

export function UIOverlay({
  params,
  setParams,
  paused,
  setPaused,
  showPanel,
  setShowPanel,
  triggerFlash,
}: UIOverlayProps) {
  const [expanded, setExpanded] = useState(true)

  const update = (key: keyof SimParams, value: number) => {
    setParams({ ...params, [key]: value })
  }

  const resetCamera = () => {
    window.dispatchEvent(new CustomEvent('stormverse:reset-camera'))
  }

  return (
    <div id="hud">
      <div className="control-surface brand-header">STORMVERSE · PROTOTYPE 01</div>

      {showPanel && (
        <aside className="control-surface science-panel" aria-label="Science panel">
          <header>
            <h2>Visual Simulation</h2>
            <button className="btn-ghost" onClick={() => setShowPanel(false)}>
              Hide
            </button>
          </header>
          <p>
            Cinematic supercell thunderstorm rendered with procedural volumetric puffs and dynamic lighting. Not live weather data.
          </p>
          {expanded && (
            <>
              <p className="hint">Silhouette-first design with organic density variation across the tower and anvil.</p>
              <p className="hint">Lightning flashes illuminate the interior briefly and add atmosphere.</p>
            </>
          )}
          <button className="btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </aside>
      )}

      {!showPanel && (
        <button
          className="control-surface btn-ghost"
          style={{ position: 'absolute', top: 'clamp(64px, 12vw, 96px)', right: 'clamp(12px, 4vw, 24px)', pointerEvents: 'auto' }}
          onClick={() => setShowPanel(true)}
        >
          Science panel
        </button>
      )}

      <div className="control-surface control-bar">
        <button onClick={() => setPaused((p) => !p)} className={paused ? 'active' : ''}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button onClick={resetCamera}>Reset Camera</button>
        <button onClick={triggerFlash}>Lightning</button>
        <div className="slider-group">
          <label>
            Detail
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={params.cloudDetail}
              onChange={(e) => update('cloudDetail', Number(e.target.value))}
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Drift
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={params.windDrift}
              onChange={(e) => update('windDrift', Number(e.target.value))}
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Flash
            <input
              type="range"
              min={0.05}
              max={0.4}
              step={0.01}
              value={params.flashFreq}
              onChange={(e) => update('flashFreq', Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="disclaimer">Visual simulation — not live weather data</div>
    </div>
  )
}
