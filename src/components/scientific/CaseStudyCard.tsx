import type { CaseStudyPack } from '../../weather/caseStudy/types'
import type { LightningSyncMode } from '../../weather/caseStudy/types'

interface CaseStudyCardProps {
  caseStudy: CaseStudyPack | null
  loading?: boolean
  error?: string | null
  syncMode: LightningSyncMode
  disabled?: boolean
  onLoadSample: () => void
  onClear: () => void
  onSyncModeChange: (mode: LightningSyncMode) => void
}

export function CaseStudyCard({
  caseStudy,
  loading,
  error,
  syncMode,
  disabled,
  onLoadSample,
  onClear,
  onSyncModeChange,
}: CaseStudyCardProps) {
  return (
    <div className="availability case-study-card">
      <h3>Multi-sensor case study</h3>
      <p className="provenance">
        Load a time-aligned lightning + truth + reference-track pack. Example packs are fixtures —
        not licensed BoM/commercial archives. Live radar continues separately.
      </p>

      <div className="verify-actions">
        <button type="button" className="primary" disabled={disabled || loading} onClick={onLoadSample}>
          Load NSW example pack
        </button>
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
        !loading && (
          <p className="provenance">
            No case study loaded. The bundled NSW pack aligns lightning, truth, and reference tracks
            on a shared clock so cross-product sync can be exercised without a licensed archive.
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
