import type { LightingMode } from '../../lib/lightingMode'
import type { LayerState, ViewMode } from '../../lib/appState'

interface ExplorationControlsProps {
  viewMode: ViewMode
  lightingMode: LightingMode
  layers: LayerState
  reducedFlash: boolean
  satelliteAvailable: boolean
  tracksLoading: boolean
  lightningConfigured: boolean
  lightningCount: number
  volumePinned: boolean
  followTrack: boolean
  chaseVolume: boolean
  compareCount: number
  cloudFieldLoading: boolean
  onLightingMode: (m: LightingMode) => void
  onLayers: (l: Partial<LayerState>) => void
  onReducedFlash: (v: boolean) => void
  onEnterImmersive: () => void
  onPinSelectedCell: () => void
  onCompareTop: () => void
  onClearCompare: () => void
  onFollowTrack: (v: boolean) => void
  onChaseVolume: (v: boolean) => void
  onExitImmersive: () => void
  onTogglePanel: () => void
  onRefreshWeather: () => void
  hasSelectedTrack: boolean
}

const LIGHTING: { id: LightingMode; label: string; title: string }[] = [
  { id: 'followSun', label: 'Follow sun', title: 'Astronomical sun from observation UTC' },
  { id: 'day', label: 'Day', title: 'Preview override — not solar time' },
  { id: 'sunrise', label: 'Sunrise', title: 'Preview override — not solar time' },
  { id: 'sunset', label: 'Sunset', title: 'Preview override — not solar time' },
  { id: 'night', label: 'Night', title: 'Preview override — not solar time' },
]

export function ExplorationControls({
  viewMode,
  lightingMode,
  layers,
  reducedFlash,
  satelliteAvailable,
  tracksLoading,
  lightningConfigured,
  lightningCount,
  volumePinned,
  followTrack,
  chaseVolume,
  compareCount,
  cloudFieldLoading,
  onLightingMode,
  onLayers,
  onReducedFlash,
  onEnterImmersive,
  onPinSelectedCell,
  onCompareTop,
  onClearCompare,
  onFollowTrack,
  onChaseVolume,
  onExitImmersive,
  onTogglePanel,
  onRefreshWeather,
  hasSelectedTrack,
}: ExplorationControlsProps) {
  return (
    <div className="exploration-controls">
      <div className="control-cluster wrap">
        {viewMode === 'globe' ? (
          <>
            <button type="button" className="primary" onClick={onEnterImmersive}>
              Enter immersive
            </button>
            <button
              type="button"
              className="primary"
              disabled={!hasSelectedTrack}
              title="Add selected derived cell to the compare set (max 4)"
              onClick={onPinSelectedCell}
            >
              {volumePinned ? 'Add to compare' : 'Pin volume'}
            </button>
            <button
              type="button"
              disabled={!hasSelectedTrack}
              title="Pin up to four top-confidence derived cells for side-by-side volumes"
              onClick={onCompareTop}
            >
              Compare cells
            </button>
            {compareCount > 0 && (
              <button type="button" title="Clear all compare volumes" onClick={onClearCompare}>
                Clear ({compareCount})
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={onExitImmersive}>
            Exit immersive
          </button>
        )}
        <button type="button" onClick={onTogglePanel}>
          Info
        </button>
        <button type="button" onClick={onRefreshWeather}>
          Refresh
        </button>
      </div>

      <div className="control-cluster wrap">
        <button
          type="button"
          className={layers.clouds ? 'active' : ''}
          title={
            cloudFieldLoading
              ? 'Loading Open-Meteo cloud-cover grid…'
              : 'Model cloud-cover field (low/mid/high type proxies)'
          }
          onClick={() => onLayers({ clouds: !layers.clouds })}
        >
          Clouds{cloudFieldLoading ? '…' : ''}
        </button>
        <button
          type="button"
          className={layers.precipitation ? 'active' : ''}
          title="Derived rain shafts at RainViewer-driven cell heads"
          onClick={() => onLayers({ precipitation: !layers.precipitation })}
        >
          Rain shafts
        </button>
        <button
          type="button"
          className={layers.radar ? 'active' : ''}
          onClick={() => onLayers({ radar: !layers.radar })}
        >
          Radar
        </button>
        <button
          type="button"
          className={layers.satellite ? 'active' : ''}
          disabled={!satelliteAvailable}
          title={
            satelliteAvailable
              ? 'Toggle infrared satellite mosaic'
              : 'Infrared frames not currently in the catalog'
          }
          onClick={() => onLayers({ satellite: !layers.satellite })}
        >
          Satellite IR
        </button>
        <button
          type="button"
          className={layers.tracks ? 'active' : ''}
          title={tracksLoading ? 'Deriving tracks…' : 'Derived cell tracks'}
          onClick={() => onLayers({ tracks: !layers.tracks })}
        >
          Tracks
        </button>
        <button
          type="button"
          className={layers.lightningObs ? 'active' : ''}
          disabled={!lightningConfigured && lightningCount === 0}
          title={
            lightningConfigured || lightningCount > 0
              ? 'Direct GeoJSON / case-study lightning only'
              : 'No lightning feed configured'
          }
          onClick={() => onLayers({ lightningObs: !layers.lightningObs })}
        >
          Lightning{lightningCount > 0 ? ` (${lightningCount})` : ''}
        </button>
        <button
          type="button"
          className={layers.volume ? 'active' : ''}
          title="Procedural georegistered cell volumes (derived aids)"
          onClick={() => onLayers({ volume: !layers.volume })}
        >
          Volumes
        </button>
      </div>

      <div className="control-cluster wrap">
        {LIGHTING.map((m) => (
          <button
            key={m.id}
            type="button"
            className={lightingMode === m.id ? 'active' : ''}
            title={m.title}
            onClick={() => onLightingMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {compareCount > 0 && (
        <div className="control-cluster wrap">
          <button
            type="button"
            className={followTrack ? 'active' : ''}
            onClick={() => onFollowTrack(!followTrack)}
          >
            Follow track
          </button>
          <button
            type="button"
            className={chaseVolume ? 'active' : ''}
            onClick={() => onChaseVolume(!chaseVolume)}
          >
            Chase camera
          </button>
        </div>
      )}

      <div className="control-cluster wrap">
        <button
          type="button"
          className={reducedFlash ? 'active' : ''}
          title="Reduce lightning flash emphasis"
          onClick={() => onReducedFlash(!reducedFlash)}
        >
          Reduce flash
        </button>
      </div>
    </div>
  )
}
