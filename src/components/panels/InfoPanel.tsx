import { APP_NAME, PROTOTYPE_STORM } from '../../config/app'
import type { ViewMode } from '../../lib/appState'
import type { StormTrack, WeatherObservationMeta } from '../../weather'
import type { EnvironmentalProfile } from '../../weather/adapters/OpenMeteoAdapter'
import { australianWeatherProvider } from '../../weather'
import { CrossSection } from '../scientific/CrossSection'

interface InfoPanelProps {
  open: boolean
  viewMode: ViewMode
  availability: WeatherObservationMeta[]
  environment: EnvironmentalProfile | null
  tracks: StormTrack[]
  selectedTrackId: string | null
  radarLabel: string | null
  tracksLoading: boolean
  loading: boolean
  error: string | null
  onClose: () => void
  onEnterStorm: () => void
  onReturnGlobe: () => void
  onSelectTrack: (trackId: string) => void
}

export function InfoPanel({
  open,
  viewMode,
  availability,
  environment,
  tracks,
  selectedTrackId,
  radarLabel,
  tracksLoading,
  loading,
  error,
  onClose,
  onEnterStorm,
  onReturnGlobe,
  onSelectTrack,
}: InfoPanelProps) {
  if (!open) return null
  const selected = tracks.find((t) => t.id === selectedTrackId) ?? null

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
            Live RainViewer mosaics plus heuristic cell tracks derived in-browser from those
            tiles. Tracks are low-confidence estimates — not official storm-cell products. The
            prototype marker still opens a synthetic 3D reconstruction.
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

          <div className="availability">
            <h3>Derived cell tracks {tracksLoading ? '(computing…)' : ''}</h3>
            {tracks.length === 0 ? (
              <p className="provenance">
                {tracksLoading
                  ? 'Sampling radar tiles over Australia…'
                  : 'No linked multi-frame cells yet — try when more precip is present.'}
              </p>
            ) : (
              <ul className="track-list">
                {tracks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={t.id === selectedTrackId ? 'active' : ''}
                      onClick={() => onSelectTrack(t.id)}
                    >
                      {t.stormId}
                      <span>
                        {t.points.length} pts · conf {Math.round((t.confidence ?? 0) * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="provenance">
              <strong>Provenance:</strong> derived from RainViewer mosaic colour samples with
              nearest-neighbour linking.
            </p>
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
                    <dt>CAPE</dt>
                    <dd>
                      {environment.capeJkg != null ? `${Math.round(environment.capeJkg)} J/kg` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>CIN</dt>
                    <dd>
                      {environment.cinJkg != null ? `${Math.round(environment.cinJkg)} J/kg` : '—'}
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

          <CrossSection
            environment={environment}
            selectedTrack={selected}
            radarIntensityHint={selected?.confidence ?? 0.35}
          />

          <p className="provenance">
            <strong>Provider:</strong> {australianWeatherProvider.displayName}. Detected lightning
            remains unavailable from this feed.
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
          <CrossSection
            environment={environment}
            selectedTrack={selected}
            radarIntensityHint={0.55}
          />
          <button type="button" onClick={onReturnGlobe}>
            Return to Earth
          </button>
        </div>
      )}
    </aside>
  )
}
