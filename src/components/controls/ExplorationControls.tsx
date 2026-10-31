import type { LightingMode } from '../../rendering/atmosphere/lighting'
import type { StormCameraPreset } from '../../rendering/storm/StormControls'
import type { LayerState, ViewMode } from '../../lib/appState'
import type { CloudParams } from '../../rendering/clouds/CloudVolume'

interface ExplorationControlsProps {
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: LayerState
  reducedFlash: boolean
  debugOpen: boolean
  cloudParams: CloudParams
  onLightingMode: (m: LightingMode) => void
  onLayers: (l: Partial<LayerState>) => void
  onPreset: (p: StormCameraPreset) => void
  onReducedFlash: (v: boolean) => void
  onToggleDebug: () => void
  onCloudParams: (p: Partial<CloudParams>) => void
  onEnterStorm: () => void
  onReturnGlobe: () => void
  onTogglePanel: () => void
  onDemoLightning: () => void
}

const PRESETS: { id: StormCameraPreset; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cloudTop', label: 'Cloud top' },
  { id: 'sideProfile', label: 'Side' },
  { id: 'ground', label: 'Ground' },
  { id: 'radar', label: 'Radar view' },
]

export function ExplorationControls({
  viewMode,
  lightingMode,
  layers,
  reducedFlash,
  debugOpen,
  cloudParams,
  onLightingMode,
  onLayers,
  onPreset,
  onReducedFlash,
  onToggleDebug,
  onCloudParams,
  onEnterStorm,
  onReturnGlobe,
  onTogglePanel,
  onDemoLightning,
}: ExplorationControlsProps) {
  return (
    <div className="exploration-controls">
      <div className="control-cluster">
        {viewMode === 'globe' ? (
          <button type="button" className="primary" onClick={onEnterStorm}>
            Enter storm
          </button>
        ) : (
          <button type="button" onClick={onReturnGlobe}>
            Earth view
          </button>
        )}
        <button type="button" onClick={onTogglePanel}>
          Info
        </button>
      </div>

      {viewMode === 'storm' && (
        <>
          <div className="control-cluster wrap">
            {(['day', 'sunset', 'night'] as LightingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={lightingMode === mode ? 'active' : ''}
                onClick={() => onLightingMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="control-cluster wrap">
            <button
              type="button"
              className={layers.clouds ? 'active' : ''}
              onClick={() => onLayers({ clouds: !layers.clouds })}
            >
              Clouds
            </button>
            <button
              type="button"
              className={layers.lightning ? 'active' : ''}
              onClick={() => onLayers({ lightning: !layers.lightning })}
            >
              Lightning
            </button>
            <button
              type="button"
              className={layers.precipitation ? 'active' : ''}
              onClick={() => onLayers({ precipitation: !layers.precipitation })}
            >
              Precip
            </button>
            <button type="button" onClick={onDemoLightning}>
              Flash
            </button>
          </div>

          <div className="control-cluster wrap">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => onPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="control-cluster wrap">
            <button
              type="button"
              className={reducedFlash ? 'active' : ''}
              onClick={() => onReducedFlash(!reducedFlash)}
            >
              Reduced flash
            </button>
            <button type="button" className={debugOpen ? 'active' : ''} onClick={onToggleDebug}>
              Cloud tune
            </button>
          </div>

          {debugOpen && (
            <div className="debug-panel">
              {(
                [
                  ['density', cloudParams.density],
                  ['verticalDevelopment', cloudParams.verticalDevelopment],
                  ['anvilExtent', cloudParams.anvilExtent],
                  ['edgeSoftness', cloudParams.edgeSoftness],
                  ['turbulence', cloudParams.turbulence],
                  ['fineDetail', cloudParams.fineDetail],
                  ['lightingResponse', cloudParams.lightingResponse],
                ] as const
              ).map(([key, value]) => (
                <label key={key}>
                  <span>{key}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={value}
                    onChange={(e) => onCloudParams({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
