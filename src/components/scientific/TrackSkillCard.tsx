import type { TrackSkillScore, TrackSkillSummary } from '../../weather'

interface TrackSkillCardProps {
  score: TrackSkillScore | null
  summary: TrackSkillSummary | null
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export function TrackSkillCard({ score, summary }: TrackSkillCardProps) {
  return (
    <div className="availability track-skill-card">
      <h3>Tracking quality (heuristic)</h3>
      <p className="provenance">
        Self-consistency proxies for derived cell tracks — <strong>not</strong> formal skill
        versus BoM or verified storm cells.
      </p>

      {summary && summary.trackCount > 0 && (
        <dl className="meta-grid">
          <div>
            <dt>Catalogue mean</dt>
            <dd>{pct(summary.meanComposite)}</dd>
          </div>
          <div>
            <dt>Solid / fair / weak</dt>
            <dd>
              {summary.solidCount} / {summary.fairCount} / {summary.weakCount}
            </dd>
          </div>
        </dl>
      )}

      {score ? (
        <>
          <div className={`skill-grade grade-${score.grade}`}>
            <span className="skill-storm">{score.stormId}</span>
            <span className="skill-composite">{pct(score.composite)}</span>
            <span className="skill-label">{score.grade}</span>
          </div>
          <div className="skill-bars" aria-label="Component proxies">
            {(
              [
                ['Coverage', score.coverage],
                ['Continuity', score.continuity],
                ['Speed steadiness', score.speedConsistency],
                ['Path smoothness', score.pathSmoothness],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="skill-bar-row">
                <span>{label}</span>
                <div className="skill-bar-track">
                  <div className="skill-bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
                </div>
                <span className="mono">{pct(value)}</span>
              </div>
            ))}
          </div>
          {score.meanSpeedKmh != null && (
            <p className="provenance">
              Mean segment speed ≈ {Math.round(score.meanSpeedKmh)} km/h · {score.pointCount}{' '}
              points
            </p>
          )}
          <p className="provenance">
            <strong>Provenance:</strong> {score.provenance.summary}
          </p>
        </>
      ) : (
        <p className="provenance">Select a derived track to inspect its quality proxies.</p>
      )}
    </div>
  )
}
