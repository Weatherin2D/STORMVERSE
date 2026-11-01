import type { CaseStudyCatalog, CaseStudyCatalogEntry, CaseStudyPack } from '../../weather'
import type { LightningSyncMode } from '../../weather'

interface CaseStudyCardProps {
  caseStudy: CaseStudyPack | null
  catalog: CaseStudyCatalog | null
  catalogLoading?: boolean
  catalogError?: string | null
  loading?: boolean
  error?: string | null
  syncMode: LightningSyncMode
  disabled?: boolean
  onLoadById: (id: string) => void
  onClear: () => void
  onSyncModeChange: (mode: LightningSyncMode) => void
}

function licenseBadge(entry: CaseStudyCatalogEntry): string {
  return entry.license === 'user-licensed' ? 'licensed' : 'example fixture'
}

export function CaseStudyCard({
  caseStudy,
  catalog,
  catalogLoading,
  catalogError,
  loading,
  error,
  syncMode,
  disabled,
  onLoadById,
  onClear,
  onSyncModeChange,
}: CaseStudyCardProps) {
  const entries = catalog?.entries ?? []

  return (
    <div className="availability case-study-card">
      <h3>Case study library</h3>
      <p className="provenance">
        Time-aligned lightning + truth + reference-track packs. Bundled entries are example fixtures
        with documented (non-)licences — not BoM/commercial archives. Live radar continues separately.
      </p>

      {catalogLoading && <p className="provenance">Loading catalog…</p>}
      {catalogError && <p className="provenance verify-error">{catalogError}</p>}

      {entries.length > 0 && (
        <ul className="case-study-list">
          {entries.map((entry) => {
            const active = caseStudy?.id === entry.id
            return (
              <li key={entry.id} className={active ? 'active' : undefined}>
                <button
                  type="button"
                  className={active ? 'active' : undefined}
                  disabled={disabled || loading}
                  onClick={() => onLoadById(entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.region} · {entry.sensors.tracks} trk · {entry.sensors.lightning} lght ·{' '}
                    {entry.sensors.truthCells} truth
                  </span>
                  <span className="case-license">{licenseBadge(entry)}</span>
                </button>
                <p className="provenance case-entry-note">{entry.licenseNote}</p>
              </li>
            )
          })}
        </ul>
      )}

      <div className="verify-actions">
        <button type="button" disabled={disabled || !caseStudy} onClick={onClear}>
          Clear case study
        </button>
      </div>

      {loading && <p className="provenance">Loading case study…</p>}
      {error && <p className="provenance verify-error">{error}</p>}

      {caseStudy ? (
        <>
          <p className="provenance">
            <strong>{caseStudy.title}</strong>
            <br />
            <span className="mono">
              {caseStudy.id} · {caseStudy.region} · focus {caseStudy.focusObservedAt}
            </span>
          </p>
          <dl className="meta-grid">
            <div>
              <dt>Tracks</dt>
              <dd>{caseStudy.tracks.length}</dd>
            </div>
            <div>
              <dt>Lightning</dt>
              <dd>{caseStudy.lightning.length}</dd>
            </div>
            <div>
              <dt>Truth cells</dt>
              <dd>{caseStudy.truthCells.length}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd className="mono">
                {caseStudy.timeRange.start.slice(11, 16)}–{caseStudy.timeRange.end.slice(11, 16)}Z
              </dd>
            </div>
          </dl>
          <p className="provenance">
            <strong>Provenance:</strong> {caseStudy.provenance.summary}
          </p>
        </>
      ) : (
        !loading &&
        !catalogLoading && (
          <p className="provenance">
            No case study loaded. Pick a catalog entry to align lightning, truth, and reference tracks
            on a shared clock.
          </p>
        )
      )}

      <label className="case-sync-label">
        <span>Lightning time sync</span>
        <select
          disabled={disabled}
          value={syncMode}
          onChange={(e) => onSyncModeChange(e.target.value as LightningSyncMode)}
        >
          <option value="off">Off</option>
          <option value="radar">Radar observation time</option>
          <option value="case" disabled={!caseStudy}>
            Case-study clock{caseStudy ? '' : ' (load pack first)'}
          </option>
        </select>
      </label>
    </div>
  )
}
