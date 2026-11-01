interface TimelineBarProps {
  clockLabel: string
  note: string
  badge: string
  frameCount: number
  onRefreshLive: () => void
}

/**
 * Live observation clock — always the current/latest mosaic frame.
 * Not a playback scrubber: STORMVERSE recreates Earth's weather now.
 */
export function TimelineBar({
  clockLabel,
  note,
  badge,
  frameCount,
  onRefreshLive,
}: TimelineBarProps) {
  return (
    <div className="timeline-bar live-clock" role="region" aria-label="Live observation">
      <div className="timeline-meta">
        <span className="badge">{badge}</span>
        <span className="mono">{clockLabel}</span>
      </div>
      <div className="timeline-controls">
        <span className="live-pill" aria-live="polite">
          LIVE
        </span>
        <span className="mono live-frame-count">
          {frameCount > 0 ? 'current frame' : 'waiting…'}
        </span>
        <button type="button" onClick={onRefreshLive}>
          Refresh now
        </button>
      </div>
      <p className="timeline-note">{note}</p>
    </div>
  )
}
