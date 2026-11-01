import type {
  LightningClassification,
  LightningObservation,
  LightningQualityFilter,
  LightningQualitySummary,
} from '../../weather'

interface LightningQualityCardProps {
  configured: boolean
  loading?: boolean
  error?: string | null
  sourceLabel?: string | null
  events: LightningObservation[]
  summary: LightningQualitySummary | null
  filter: LightningQualityFilter
  disabled?: boolean
  onFilterChange: (next: LightningQualityFilter) => void
  onLoadSample: () => void
  onClear: () => void
}

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v * 100)}%`
}

function classLabel(c: LightningClassification): string {
  if (c === 'cloud_to_ground') return 'CG'
  if (c === 'intra_cloud') return 'IC'
  return 'Unknown'
}

export function LightningQualityCard({
  configured,
  loading,
  error,
  sourceLabel,
  events,
  summary,
  filter,
  disabled,
  onFilterChange,
  onLoadSample,
  onClear,
}: LightningQualityCardProps) {
  const classMode =
    filter.classifications === 'all'
      ? 'all'
      : filter.classifications.length === 1
        ? filter.classifications[0]
        : 'all'

  const selected =
    events.find((e) => e.qualityScore != null) ?? events[0] ?? null

  return (
    <div className="availability lightning-quality-card">
      <h3>Lightning quality</h3>
      <p className="provenance">
        Quality / network / polarity fields come from the configured GeoJSON feed when present.
        Local filters hide markers only — they do <strong>not</strong> invent detections.
      </p>

      <div className="verify-actions">
        <button type="button" className="primary" disabled={disabled || loading} onClick={onLoadSample}>
          Load sample feed
        </button>
        <button type="button" disabled={disabled || !configured} onClick={onClear}>
          Clear feed
        </button>
      </div>

      {sourceLabel && <p className="provenance mono">Source · {sourceLabel}</p>}
      {loading && <p className="provenance">Loading lightning feed…</p>}
      {error && <p className="provenance verify-error">{error}</p>}

      {!configured && !loading && (
        <p className="provenance">
          Not configured. Set <span className="mono">VITE_LIGHTNING_GEOJSON_URL</span> to a licensed
          FeatureCollection, or load the bundled sample to exercise quality metadata.
        </p>
      )}

      {configured && (
        <>
          <div className="lightning-filters">
            <label>
              <span>Min quality</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                value={Math.round(filter.minQuality * 100)}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    minQuality: Number(e.target.value) / 100,
                  })
                }
              />
              <span className="mono">{pct(filter.minQuality)}</span>
            </label>
            <label>
              <span>Classification</span>
              <select
                disabled={disabled}
                value={classMode}
                onChange={(e) => {
                  const v = e.target.value
                  onFilterChange({
                    ...filter,
                    classifications:
                      v === 'all' ? 'all' : ([v] as LightningClassification[]),
                  })
                }}
              >
                <option value="all">All</option>
                <option value="cloud_to_ground">Cloud-to-ground</option>
                <option value="intra_cloud">Intra-cloud</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="lightning-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={filter.allowMissingQuality}
                onChange={(e) =>
                  onFilterChange({ ...filter, allowMissingQuality: e.target.checked })
                }
              />
              <span>Include events without qualityScore</span>
            </label>
          </div>

          {summary && (
            <dl className="meta-grid">
              <div>
                <dt>Visible / total</dt>
                <dd>
                  {summary.visible} / {summary.total}
                </dd>
              </div>
              <div>
                <dt>With quality</dt>
                <dd>
                  {summary.withQuality} · mean {pct(summary.meanQuality)}
                </dd>
              </div>
              <div>
                <dt>CG / IC / ?</dt>
                <dd>
                  {summary.cgCount} / {summary.icCount} / {summary.unknownClassCount}
                </dd>
              </div>
              <div>
                <dt>High quality (≥75%)</dt>
                <dd>{summary.highQualityCount}</dd>
              </div>
            </dl>
          )}

          {selected ? (
            <div className="lightning-sample">
              <p className="provenance">
                <strong>Sample event</strong> · {classLabel(selected.classification)}
                {selected.network ? ` · ${selected.network}` : ''}
              </p>
              <dl className="meta-grid">
                <div>
                  <dt>Quality</dt>
                  <dd>{pct(selected.qualityScore ?? null)}</dd>
                </div>
                <div>
                  <dt>Peak current</dt>
                  <dd>
                    {selected.peakCurrentKa != null
                      ? `${selected.peakCurrentKa.toFixed(0)} kA`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Polarity</dt>
                  <dd>{selected.polarity ?? '—'}</dd>
                </div>
                <div>
                  <dt>Loc. error</dt>
                  <dd>
                    {selected.locationErrorKm != null
                      ? `${selected.locationErrorKm.toFixed(1)} km`
                      : '—'}
                  </dd>
                </div>
              </dl>
              <p className="provenance">
                <strong>Provenance:</strong> {selected.provenance.summary}
              </p>
            </div>
          ) : (
            <p className="provenance">No events in the current feed/filter.</p>
          )}
        </>
      )}
    </div>
  )
}
