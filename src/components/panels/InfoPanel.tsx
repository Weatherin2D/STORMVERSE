import { APP_NAME, PROTOTYPE_STORM } from '../../config/app'
import type { ViewMode } from '../../lib/appState'
import type { EnvironmentalSample, WeatherObservationMeta } from '../../weather'
import { australianWeatherProvider } from '../../weather'

interface InfoPanelProps {
  open: boolean
  viewMode: ViewMode
  availability: WeatherObservationMeta[]
  environment: EnvironmentalSample | null
  radarLabel: string | null
  loading: boolean
  error: string | null
  onClose: () => void
  onEnterStorm: () => void
  onReturnGlobe: () => void
}

export function InfoPanel({
  open,
  viewMode,
  availability,
  environment,
  radarLabel,
  loading,
  error,
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
            Live radar mosaics for the Australia region are overlaid from the public RainViewer
            catalog. Select the prototype storm marker to enter the synthetic 3D reconstruction —
            clouds there are not derived from the radar tiles.
          </p>
          <p className="provenance">
            <strong>Active radar frame:</strong> {radarLabel ?? (loading ? 'Loading…' : 'Unavailable')}
          </p>
          {error && <p className="provenance">{error}</p>}
          <div className="availability">
            <h3>Observation feeds</h3>
            <ul>
              {availability.map((item) => (
                <li key={item.id}>
                  <span>{item.productType.split('_').join(' ')}</span>
                  <span className={item.available ? 'ok' : 'missing'}>
                    {item.available ? item.provenance.kind : 'unavailable'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {environment && (
            <div className="availability">
              <h3>Environment at prototype site</h3>
              {environment.available ? (
                <dl className="meta-grid">
                  <div>
                    <dt>Temperature</dt>
                    <dd>{environment.temperatureC?.toFixed(1) ?? '—'} °C</dd>
                  </div>
                  <div>
                    <dt>Humidity</dt>
                    <dd>{environment.relativeHumidityPct ?? '—'}%</dd>
                  </div>
                  <div>
                    <dt>Wind</dt>
                    <dd>
                      {environment.windSpeedMps != null
                        ? `${environment.windSpeedMps.toFixed(1)} m/s`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Precip (model)</dt>
                    <dd>
                      {environment.precipitationMm != null
                        ? `${environment.precipitationMm.toFixed(1)} mm`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="provenance">Environmental model context unavailable.</p>
              )}
              <p className="provenance">
                <strong>Provenance:</strong> {environment.provenance.summary}
              </p>
            </div>
          )}
          <p className="provenance">
            <strong>Provider:</strong> {australianWeatherProvider.displayName}. Lightning and
            automated storm tracks are not included in this feed.
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
                    {item.available ? item.provenance.kind : 'unavailable'}
                  </span>
                </li>
              ))}
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
