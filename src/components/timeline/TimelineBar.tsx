import { TIMELINE } from '../../config/app'
import type { TimelineState, ViewMode } from '../../lib/appState'

interface TimelineBarProps {
  viewMode: ViewMode
  timeline: TimelineState
  clockLabel: string
  note: string
  badge: string
  onChange: (next: Partial<TimelineState>) => void
  onReset: () => void
}

export function TimelineBar({
  viewMode,
  timeline,
  clockLabel,
  note,
  badge,
  onChange,
  onReset,
}: TimelineBarProps) {
  const max = Math.max(1, timeline.max)
  const value = Math.min(timeline.cursor, max)

  return (
    <div
      className="timeline-bar"
      role="region"
      aria-label="Observation timeline"
    >
      <div className="timeline-meta">
        <span className="badge">{badge}</span>
        <span className="mono">{clockLabel}</span>
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
        max={max}
        step={viewMode === 'globe' ? 1 : 1}
        value={value}
        aria-label="Seek timeline"
        onChange={(e) => onChange({ cursor: Number(e.target.value), playing: false })}
      />
      <p className="timeline-note">{note}</p>
    </div>
  )
}
