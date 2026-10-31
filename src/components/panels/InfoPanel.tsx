import { APP_NAME, PROTOTYPE_STORM } from '../../config/app'
import type { ViewMode } from '../../lib/appState'
import type { WeatherObservationMeta } from '../../weather'
import { australianWeatherProvider } from '../../weather'

interface InfoPanelProps {
  open: boolean
  viewMode: ViewMode
  availability: WeatherObservationMeta[]
  onClose: () => void
  onEnterStorm: () => void
  onReturnGlobe: () => void
}

export function InfoPanel({
  open,
  viewMode,
  availability,
  onClose,
  onEnterStorm,
  onReturnGlobe,
}: InfoPanelProps) {
  if (!open) return null

  return (
    <aside className="info-panel" aria-label="Storm information">
      <header>
        <div>
          <p className="eyebrow">{APP_NAME}</p>
          <h2>{viewMode === 'storm' ? PROTOTYPE_STORM.name : 'Earth exploration'}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          Close
        </button>
      </header>

      {viewMode === 'globe' ? (
        <div className="panel-body">
          <p>
            Navigate the interactive Earth, then select the marked prototype storm over inland
            New South Wales to enter the three-dimensional thunderstorm environment.
          </p>
          <p className="provenance">
            <strong>Provenance:</strong> globe imagery may come from Cesium Ion (if configured)
            or OpenStreetMap tiles. The storm marker is a synthetic demonstration target.
          </p>
          <button type="button" className="primary" onClick={onEnterStorm}>
            Approach prototype storm
          </button>
        </div>
      ) : (
        <div className="panel-body">
          <p>{PROTOTYPE_STORM.description}</p>
          <dl className="meta-grid">
            <div>
              <dt>Location</dt>
              <dd>
                {PROTOTYPE_STORM.latitude.toFixed(2)}°, {PROTOTYPE_STORM.longitude.toFixed(2)}°
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>Synthetic / procedural reconstruction</dd>
            </div>
            <div>
              <dt>Lightning</dt>
              <dd>Synthetic demonstration events</dd>
            </div>
            <div>
              <dt>Precipitation</dt>
              <dd>Visual shafts only — not measured rainfall</dd>
            </div>
          </dl>
          <div className="availability">
            <h3>Data availability</h3>
            <ul>
              {availability.map((item) => (
                <li key={item.id}>
                  <span>{item.productType.split('_').join(' ')}</span>
                  <span className={item.available ? 'ok' : 'missing'}>
                    {item.available ? 'demo' : 'unavailable'}
                  </span>
                </li>
              ))}
              <li>
                <span>{australianWeatherProvider.displayName}</span>
                <span className="missing">stub</span>
              </li>
            </ul>
          </div>
          <button type="button" onClick={onReturnGlobe}>
            Return to Earth
          </button>
        </div>
      )}
    </aside>
  )
}
