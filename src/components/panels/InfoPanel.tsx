import { APP_NAME, PROTOTYPE_STORM } from '../../config/app'
import type { ViewMode } from '../../lib/appState'
import type { StormTrack, WeatherObservationMeta } from '../../weather'
import type { EnvironmentalProfile } from '../../weather/adapters/OpenMeteoAdapter'
import type { ReconstructionTarget } from '../../weather'
import { australianWeatherProvider } from '../../weather'
import { CrossSection } from '../scientific/CrossSection'

interface InfoPanelProps {
  open: boolean
  viewMode: ViewMode
  availability: WeatherObservationMeta[]
  environment: EnvironmentalProfile | null
  tracks: StormTrack[]
  selectedTrackId: string | null
  reconstruction: ReconstructionTarget | null
  radarLabel: string | null
  tracksLoading: boolean
  lightningConfigured: boolean
  lightningCount: number
  loading: boolean
  error: string | null
  onClose: () => void
  volumePinned: boolean
  followTrack: boolean
  onEnterStorm: () => void
  onPinSelectedCell: () => void
  onEnterSelectedCell: () => void
  onFollowTrack: (v: boolean) => void
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
  reconstruction,
  radarLabel,
  tracksLoading,
  lightningConfigured,
  lightningCount,
  loading,
  error,
  volumePinned,
  followTrack,
  onClose,
  onEnterStorm,
  onPinSelectedCell,
  onEnterSelectedCell,
  onFollowTrack,
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
          <h2>
            {viewMode === 'storm'
              ? reconstruction?.label ?? PROTOTYPE_STORM.name
              : 'Earth exploration'}
          </h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          Close
        </button>
      </header>

      {viewMode === 'globe' ? (
        <div className="panel-body">
          <p>
            Select a derived cell, then <strong>Pin volume</strong> to place a georegistered
            procedural storm on the globe. With <strong>Follow track</strong> on, the volume walks
            the track as you scrub observation time. <strong>Enter immersive</strong> opens the
            local Three.js close-up.
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
            <h3>Lightning feed</h3>
            <p className="provenance">
              {lightningConfigured
                ? `${lightningCount} event(s) loaded from VITE_LIGHTNING_GEOJSON_URL.`
                : 'Not configured. Point VITE_LIGHTNING_GEOJSON_URL at a licensed FeatureCollection (see public/samples/lightning.example.geojson).'}
            </p>
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
          </div>

          {reconstruction && selected && (
            <div className="availability">
              <h3>Georegistered volume</h3>
              <dl className="meta-grid">
                <div>
                  <dt>Focus</dt>
                  <dd>
                    {reconstruction.latitude.toFixed(2)}°, {reconstruction.longitude.toFixed(2)}°
                  </dd>
                </div>
                <div>
                  <dt>Pinned</dt>
                  <dd>{volumePinned ? 'On globe' : 'Not yet'}</dd>
                </div>
                <div>
                  <dt>Follow track</dt>
                  <dd>{followTrack && volumePinned ? 'Animating with timeline' : 'Static pin'}</dd>
                </div>
                <div>
                  <dt>Along track</dt>
                  <dd>
                    {reconstruction.drivers.alongTrackProgress != null
                      ? `${Math.round(reconstruction.drivers.alongTrackProgress * 100)}%`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>CAPE driver</dt>
                  <dd>
                    {reconstruction.drivers.capeJkg != null
                      ? `${Math.round(reconstruction.drivers.capeJkg)} J/kg`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Cell conf.</dt>
                  <dd>
                    {reconstruction.drivers.cellConfidence != null
                      ? `${Math.round(reconstruction.drivers.cellConfidence * 100)}%`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Density</dt>
                  <dd>{reconstruction.cloudParams.density.toFixed(2)}</dd>
                </div>
              </dl>
              <p className="provenance">
                <strong>Provenance:</strong> {reconstruction.provenance.summary}
              </p>
              <div className="control-cluster wrap">
                <button type="button" className="primary" onClick={onPinSelectedCell}>
                  {volumePinned ? 'Update volume on globe' : 'Pin volume on globe'}
                </button>
                <button
                  type="button"
                  className={followTrack ? 'active' : ''}
                  disabled={!volumePinned}
                  onClick={() => onFollowTrack(!followTrack)}
                >
                  Follow track
                </button>
                <button type="button" onClick={onEnterSelectedCell}>
                  Enter immersive
                </button>
              </div>
            </div>
          )}

          {environment && (
            <div className="availability">
              <h3>Environment at prototype site</h3>
              {environment.available ? (
                <dl className="meta-grid">
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
                  <div>
                    <dt>Temperature</dt>
                    <dd>{environment.temperatureC?.toFixed(1) ?? '—'} °C</dd>
                  </div>
                  <div>
                    <dt>Humidity</dt>
                    <dd>{environment.relativeHumidityPct ?? '—'}%</dd>
                  </div>
                </dl>
              ) : (
                <p className="provenance">Environmental model context unavailable.</p>
              )}
            </div>
          )}

          <CrossSection
            environment={environment}
            selectedTrack={selected}
            radarIntensityHint={selected?.confidence ?? 0.35}
          />

          <p className="provenance">
            <strong>Provider:</strong> {australianWeatherProvider.displayName}
          </p>
          <button type="button" onClick={onEnterStorm}>
            Enter prototype storm
          </button>
        </div>
      ) : (
        <div className="panel-body">
          <p>
            {reconstruction?.provenance.summary ?? PROTOTYPE_STORM.description}
          </p>
          <dl className="meta-grid">
            <div>
              <dt>Focus</dt>
              <dd>
                {(reconstruction?.latitude ?? PROTOTYPE_STORM.latitude).toFixed(2)}°,{' '}
                {(reconstruction?.longitude ?? PROTOTYPE_STORM.longitude).toFixed(2)}°
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{reconstruction?.provenance.kind ?? 'synthetic'} reconstruction</dd>
            </div>
            <div>
              <dt>Lightning FX</dt>
              <dd>Synthetic demonstration in 3D scene</dd>
            </div>
            <div>
              <dt>Globe lightning</dt>
              <dd>
                {lightningConfigured ? `${lightningCount} feed events` : 'Feed not configured'}
              </dd>
            </div>
          </dl>
          <CrossSection
            environment={environment}
            selectedTrack={selected}
            radarIntensityHint={reconstruction?.drivers.cellConfidence ?? 0.55}
          />
          <button type="button" onClick={onReturnGlobe}>
            Return to Earth
          </button>
        </div>
      )}
    </aside>
  )
}
