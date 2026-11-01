import type { CrossProductReport } from '../../weather'

interface CrossProductQualityCardProps {
  report: CrossProductReport | null
  syncLabel?: string | null
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export function CrossProductQualityCard({ report, syncLabel }: CrossProductQualityCardProps) {
  if (!report) {
    return (
      <div className="availability cross-product-card">
        <h3>Cross-product quality</h3>
        <p className="provenance">Waiting for observation context…</p>
      </div>
    )
  }

  return (
    <div className="availability cross-product-card">
      <h3>Cross-product quality</h3>
      <p className="provenance">
        Radar ↔ tracks ↔ lightning ↔ truth readiness and co-location hints. Exploratory only —{' '}
        <strong>not</strong> multi-sensor verification skill.
      </p>

      <ul className="cross-feed-list">
        {report.feeds.map((f) => (
          <li key={f.id}>
            <span>{f.label}</span>
            <span className={f.ready ? 'ok' : 'missing'}>{f.ready ? 'ready' : 'gap'}</span>
            <span className="mono cross-feed-detail">{f.detail}</span>
          </li>
        ))}
      </ul>

      <div className={`cross-coherence coherence-${report.coherenceLabel}`}>
        <span className="skill-storm">Coherence hint</span>
        <span className="skill-composite">{pct(report.coherenceHint)}</span>
        <span className="skill-label">{report.coherenceLabel}</span>
      </div>

      <dl className="meta-grid">
        <div>
          <dt>Lightning in ±{Math.round(report.timeWindowSec / 60)} min</dt>
          <dd>{report.lightningInTimeWindow}</dd>
        </div>
        <div>
          <dt>Near selected (≤{report.nearTrackKm} km)</dt>
          <dd>
            {report.lightningNearSelected}
            {report.selectedStormId ? (
              <span className="mono"> · {report.selectedStormId}</span>
            ) : (
              ''
            )}
          </dd>
        </div>
      </dl>

      {syncLabel && <p className="provenance mono">Time sync · {syncLabel}</p>}

      <p className="provenance">
        <strong>Provenance:</strong> {report.provenance.summary}
      </p>
    </div>
  )
}
