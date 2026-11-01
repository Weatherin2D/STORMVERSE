import { APP_NAME, PROTOTYPE_STORM } from '../../config/app'
import type { ViewMode } from '../../lib/appState'
import type { SceneBookmarkListItem } from '../../lib/sceneBookmarks'
import type {
  CaseStudyPack,
  CrossProductReport,
  LightningObservation,
  LightningQualityFilter,
  LightningQualitySummary,
  LightningSyncMode,
  ReconstructionTarget,
  StormTrack,
  TrackSkillScore,
  TrackSkillSummary,
  TrackTruthMatch,
  TrackTruthSummary,
  WeatherObservationMeta,
} from '../../weather'
import type { EnvironmentalProfile } from '../../weather/adapters/OpenMeteoAdapter'
import { australianWeatherProvider } from '../../weather'
import { CrossSection } from '../scientific/CrossSection'
import { TrackSkillCard } from '../scientific/TrackSkillCard'
import { TrackVerificationCard } from '../scientific/TrackVerificationCard'
import { LightningQualityCard } from '../scientific/LightningQualityCard'
import { CrossProductQualityCard } from '../scientific/CrossProductQualityCard'
import { CaseStudyCard } from '../scientific/CaseStudyCard'
import { SceneBookmarkGallery } from '../controls/SceneBookmarkGallery'

interface InfoPanelProps {
  open: boolean
  viewMode: ViewMode
  availability: WeatherObservationMeta[]
  environment: EnvironmentalProfile | null
  tracks: StormTrack[]
  selectedTrackId: string | null
  reconstruction: ReconstructionTarget | null
  compareVolumes: ReconstructionTarget[]
  trackSkills: TrackSkillScore[]
  trackSkillSummary: TrackSkillSummary | null
  trackTruthMatch: TrackTruthMatch | null
  trackTruthSummary: TrackTruthSummary | null
  truthConfigured: boolean
  truthLoading: boolean
  truthError: string | null
  truthSourceLabel: string | null
  bookmarks: SceneBookmarkListItem[]
  radarLabel: string | null
  tracksLoading: boolean
  lightningConfigured: boolean
  lightningCount: number
  lightningVisibleCount: number
  lightningLoading: boolean
  lightningError: string | null
  lightningSourceLabel: string | null
  lightningEvents: LightningObservation[]
  lightningFilter: LightningQualityFilter
  lightningSummary: LightningQualitySummary | null
  crossProductReport: CrossProductReport | null
  lightningSyncMode: LightningSyncMode
  caseStudy: CaseStudyPack | null
  caseStudyLoading: boolean
  caseStudyError: string | null
  loading: boolean
  error: string | null
  onClose: () => void
  volumePinned: boolean
  followTrack: boolean
  onEnterStorm: () => void
  onPinSelectedCell: () => void
  onEnterSelectedCell: () => void
  onFollowTrack: (v: boolean) => void
  onCompareTop: () => void
  onClearCompare: () => void
  onRemoveCompare: (trackId: string) => void
  onReturnGlobe: () => void
  onSelectTrack: (trackId: string) => void
  onLightningFilterChange: (next: LightningQualityFilter) => void
  onLoadLightningSample: () => void
  onClearLightningFeed: () => void
  onLightningSyncModeChange: (mode: LightningSyncMode) => void
  onLoadCaseStudySample: () => void
  onClearCaseStudy: () => void
  canUseTracksAsTruth: boolean
  onLoadTruthSample: () => void
  onUseTracksAsTruth: () => void
  onClearTruthCatalogue: () => void
  onExportTruthTemplate: () => void
  onRefreshBookmarks: () => void
  onSaveBookmark: (name: string) => { ok: boolean; message: string }
  onRestoreBookmark: (id: string) => { ok: boolean; message: string }
  onRenameBookmark: (id: string, name: string) => { ok: boolean; message: string }
  onDeleteBookmark: (id: string) => { ok: boolean; message: string }
}

export function InfoPanel({
  open,
  viewMode,
  availability,
  environment,
  tracks,
  selectedTrackId,
  reconstruction,
  compareVolumes,
  trackSkills,
  trackSkillSummary,
  trackTruthMatch,
  trackTruthSummary,
  truthConfigured,
  truthLoading,
  truthError,
  truthSourceLabel,
  bookmarks,
  radarLabel,
  tracksLoading,
  lightningConfigured,
  lightningCount,
  lightningVisibleCount,
  lightningLoading,
  lightningError,
  lightningSourceLabel,
  lightningEvents,
  lightningFilter,
  lightningSummary,
  crossProductReport,
  lightningSyncMode,
  caseStudy,
  caseStudyLoading,
  caseStudyError,
  loading,
  error,
  volumePinned,
  followTrack,
  onClose,
  onEnterStorm,
  onPinSelectedCell,
  onEnterSelectedCell,
  onFollowTrack,
  onCompareTop,
  onClearCompare,
  onRemoveCompare,
  onReturnGlobe,
  onSelectTrack,
  onLightningFilterChange,
  onLoadLightningSample,
  onClearLightningFeed,
  onLightningSyncModeChange,
  onLoadCaseStudySample,
  onClearCaseStudy,
  canUseTracksAsTruth,
  onLoadTruthSample,
  onUseTracksAsTruth,
  onClearTruthCatalogue,
  onExportTruthTemplate,
  onRefreshBookmarks,
  onSaveBookmark,
  onRestoreBookmark,
  onRenameBookmark,
  onDeleteBookmark,
}: InfoPanelProps) {
  if (!open) return null
  const selected = tracks.find((t) => t.id === selectedTrackId) ?? null
  const selectedSkill = trackSkills.find((s) => s.trackId === selectedTrackId) ?? null
  const skillById = Object.fromEntries(trackSkills.map((s) => [s.trackId, s]))

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
            Pin cells onto the globe, or use <strong>Compare cells</strong> to place up to four
            accent-coloured procedural volumes side by side. <strong>Follow track</strong> walks
            them with observation time; the selected cell is the primary (ray-marched) volume.
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

          <CaseStudyCard
            caseStudy={caseStudy}
            loading={caseStudyLoading}
            error={caseStudyError}
            syncMode={lightningSyncMode}
            disabled={loading}
            onLoadSample={onLoadCaseStudySample}
            onClear={onClearCaseStudy}
            onSyncModeChange={onLightningSyncModeChange}
          />

          <CrossProductQualityCard
            report={crossProductReport}
            syncLabel={
              lightningSyncMode === 'off'
                ? 'off'
                : lightningSyncMode === 'radar'
                  ? 'radar observation time'
                  : caseStudy
                    ? `case clock · ${caseStudy.focusObservedAt}`
                    : 'case clock (inactive)'
            }
          />

          <div className="availability">
            <LightningQualityCard
              configured={lightningConfigured}
              loading={lightningLoading}
              error={lightningError}
              sourceLabel={lightningSourceLabel}
              events={lightningEvents}
              summary={lightningSummary}
              filter={lightningFilter}
              disabled={loading}
              onFilterChange={onLightningFilterChange}
              onLoadSample={onLoadLightningSample}
              onClear={onClearLightningFeed}
            />
            {lightningConfigured && (
              <p className="provenance">
                Globe shows {lightningVisibleCount} of {lightningCount} feed event(s) after local
                quality filters.
              </p>
            )}
          </div>

          <div className="availability">
            <h3>
              {caseStudy
                ? 'Case-study reference tracks'
                : `Derived cell tracks ${tracksLoading ? '(computing…)' : ''}`}
            </h3>
            {caseStudy && (
              <p className="provenance">
                Showing example reference tracks from the loaded case study. Live RainViewer-derived
                cells resume when you clear the case study.
              </p>
            )}
            {tracks.length === 0 ? (
              <p className="provenance">
                {tracksLoading
                  ? 'Sampling radar tiles over Australia…'
                  : 'No linked multi-frame cells yet — try when more precip is present.'}
              </p>
            ) : (
              <ul className="track-list">
                {tracks.map((t) => {
                  const inCompare = compareVolumes.some((v) => v.drivers.trackId === t.id || v.id === t.id)
                  const accent = compareVolumes.find((v) => v.id === t.id || v.drivers.trackId === t.id)
                    ?.accentCss
                  const skill = skillById[t.id]
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={t.id === selectedTrackId ? 'active' : ''}
                        style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                        onClick={() => onSelectTrack(t.id)}
                      >
                        {t.stormId}
                        {inCompare ? ' · compare' : ''}
                        <span>
                          {t.points.length} pts · conf {Math.round((t.confidence ?? 0) * 100)}%
                          {skill ? ` · ${skill.grade} ${Math.round(skill.composite * 100)}%` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="control-cluster wrap" style={{ marginTop: '0.6rem' }}>
              <button type="button" className="primary" disabled={tracks.length === 0} onClick={onCompareTop}>
                Compare top cells
              </button>
              {compareVolumes.length > 0 && (
                <button type="button" onClick={onClearCompare}>
                  Clear compare
                </button>
              )}
            </div>
          </div>

          {compareVolumes.length > 0 && (
            <div className="availability">
              <h3>Volume compare ({compareVolumes.length})</h3>
              <p className="provenance">
                Side-by-side procedural volumes — not measured radar volumes. Primary cell is
                ray-marched; others use accent schematics.
              </p>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Cell</th>
                    <th>Conf</th>
                    <th>Skill</th>
                    <th>Track</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {compareVolumes.map((v) => {
                    const skill = skillById[v.drivers.trackId ?? v.id]
                    return (
                      <tr key={v.id} className={v.primary ? 'primary-row' : ''}>
                        <td>
                          <span className="swatch" style={{ background: v.accentCss ?? '#e8c27a' }} />
                          {v.label.replace(' reconstruction', '')}
                          {v.primary ? ' ★' : ''}
                        </td>
                        <td>
                          {v.drivers.cellConfidence != null
                            ? `${Math.round(v.drivers.cellConfidence * 100)}%`
                            : '—'}
                        </td>
                        <td>
                          {skill
                            ? `${Math.round(skill.composite * 100)}% ${skill.grade}`
                            : '—'}
                        </td>
                        <td>
                          {v.drivers.alongTrackProgress != null
                            ? `${Math.round(v.drivers.alongTrackProgress * 100)}%`
                            : '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => onRemoveCompare(v.drivers.trackId ?? v.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <SceneBookmarkGallery
            disabled={loading}
            bookmarks={bookmarks}
            onRefresh={onRefreshBookmarks}
            onSave={onSaveBookmark}
            onRestore={onRestoreBookmark}
            onRename={onRenameBookmark}
            onDelete={onDeleteBookmark}
          />

          <TrackSkillCard score={selectedSkill} summary={trackSkillSummary} />

          <TrackVerificationCard
            configured={truthConfigured}
            loading={truthLoading}
            error={truthError}
            sourceLabel={truthSourceLabel}
            summary={trackTruthSummary}
            selected={trackTruthMatch}
            disabled={loading}
            canUseTracks={canUseTracksAsTruth}
            onLoadSample={onLoadTruthSample}
            onUseTracksAsTruth={onUseTracksAsTruth}
            onClear={onClearTruthCatalogue}
            onExportTemplate={onExportTruthTemplate}
          />

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
                  {volumePinned ? 'Add selected to compare' : 'Pin volume on globe'}
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
                {lightningConfigured
                  ? `${lightningVisibleCount}/${lightningCount} visible`
                  : 'Feed not configured'}
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
