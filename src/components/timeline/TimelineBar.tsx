import { TIMELINE } from '../../config/app'
import type { TimelineState } from '../../lib/appState'
import { prototypeProvider } from '../../weather'

interface TimelineBarProps {
  timeline: TimelineState
  onChange: (next: Partial<TimelineState>) => void
  onReset: () => void
}

function formatSimClock(simSec: number): string {
  const iso = prototypeProvider.simTimeToIso(simSec)
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

export function TimelineBar({ timeline, onChange, onReset }: TimelineBarProps) {
  return (
    <div className="timeline-bar" role="region" aria-label="Prototype simulation timeline">
      <div className="timeline-meta">
        <span className="badge">Prototype simulation time</span>
        <span className="mono">{formatSimClock(timeline.simTime)}</span>
      </div>
      <div className="timeline-controls">
        <button
          type="button"
          className={timeline.playing ? 'active' : ''}
          onClick={() => onChange({ playing: !timeline.playing })}
        >
          {timeline.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
        <label className="speed">
          Speed
          <select
            value={timeline.speed}
            onChange={(e) => onChange({ speed: Number(e.target.value) })}
          >
            {TIMELINE.speeds.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        className="timeline-scrub"
        type="range"
        min={0}
        max={timeline.duration}
        step={1}
        value={timeline.simTime}
        aria-label="Seek prototype simulation time"
        onChange={(e) =>
          onChange({ simTime: Number(e.target.value), playing: false })
        }
      />
      <p className="timeline-note">
        Controls synthetic storm animation — not real-time weather observations.
      </p>
    </div>
  )
}
