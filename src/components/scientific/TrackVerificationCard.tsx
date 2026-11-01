import type { TrackTruthMatch, TrackTruthSummary } from '../../weather'

interface TrackVerificationCardProps {
  configured: boolean
  loading?: boolean
  error?: string | null
  sourceLabel?: string | null
  summary: TrackTruthSummary | null
  selected: TrackTruthMatch | null
  disabled?: boolean
  canUseTracks?: boolean
  onLoadSample: () => void
  onUseTracksAsTruth: () => void
  onClear: () => void
  onExportTemplate: () => void
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function formatKm(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v < 10 ? `${v.toFixed(1)} km` : `${Math.round(v)} km`
}

function formatDelta(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  if (sec < 60) return `${Math.round(sec)} s`
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  return `${(sec / 3600).toFixed(1)} h`
}

export function TrackVerificationCard({
  configured,
  loading,
  error,
  sourceLabel,
  summary,
  selected,
  disabled,
  canUseTracks,
  onLoadSample,
  onUseTracksAsTruth,
  onClear,
  onExportTemplate,
}: TrackVerificationCardProps) {
  return (
    <div className="availability track-verify-card">
      <h3>Track verification hooks</h3>
      <p className="provenance">
        Optional association of derived tracks to a user-supplied truth-cell catalogue. Scores are
        geometric/temporal gates only — <strong>not</strong> published BoM verification skill.
      </p>

      <div className="verify-actions">
        <button type="button" className="primary" disabled={disabled || loading} onClick={onLoadSample}>
          Load sample catalogue
        </button>
        <button
          type="button"
          disabled={disabled || !canUseTracks}
          title="Use current derived-track midpoints as a stand-in catalogue to exercise matching"
          onClick={onUseTracksAsTruth}
        >
          Use tracks as stand-in
        </button>
        <button type="button" disabled={disabled || !configured} onClick={onClear}>
          Clear catalogue
        </button>
        <button type="button" disabled={disabled || !canUseTracks} onClick={onExportTemplate}>
          Export template
        </button>
      </div>

      {sourceLabel && (
        <p className="provenance mono">Source · {sourceLabel}</p>
      )}
      {loading && <p className="provenance">Loading truth cells…</p>}
      {error && <p className="provenance verify-error">{error}</p>}

      {!configured && !loading && (
        <p className="provenance">
          Not configured. Set <span className="mono">VITE_TRUTH_CELLS_GEOJSON_URL</span>, load the
          bundled sample for a plumbing demo, or export current tracks as a stand-in template.
        </p>
      )}

      {configured && summary && (
        <dl className="meta-grid">
          <div>
            <dt>Truth cells</dt>
            <dd>{summary.truthCount}</dd>
          </div>
          <div>
            <dt>Associated</dt>
            <dd>
              {summary.associatedCount} / {summary.trackCount}
            </dd>
          </div>
          <div>
            <dt>Mean score</dt>
            <dd>{pct(summary.meanScore)}</dd>
          </div>
          <div>
            <dt>Mean distance</dt>
            <dd>{formatKm(summary.meanDistanceKm)}</dd>
          </div>
        </dl>
      )}

      {selected ? (
        <>
          <div className={`verify-match ${selected.associated ? 'associated' : 'unmatched'}`}>
            <span className="skill-storm">{selected.stormId}</span>
            <span className="skill-composite">{pct(selected.score)}</span>
            <span className="skill-label">{selected.associated ? selected.method : 'unmatched'}</span>
          </div>
          <dl className="meta-grid">
            <div>
              <dt>Truth id</dt>
              <dd className="mono">{selected.truthCellId ?? '—'}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{formatKm(selected.distanceKm)}</dd>
            </div>
            <div>
              <dt>Time Δ</dt>
              <dd>{formatDelta(selected.timeDeltaSec)}</dd>
            </div>
            <div>
              <dt>Truth stormId</dt>
              <dd className="mono">{selected.truthStormId ?? '—'}</dd>
            </div>
          </dl>
          <p className="provenance">
            <strong>Provenance:</strong> {selected.provenance.summary}
          </p>
        </>
      ) : (
        configured && (
          <p className="provenance">Select a derived track to inspect its truth association.</p>
        )
      )}
    </div>
  )
}
