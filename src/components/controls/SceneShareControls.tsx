import { useRef, useState } from 'react'

interface SceneShareControlsProps {
  disabled?: boolean
  onExportJson: () => void
  onCopyLink: () => Promise<boolean> | boolean
  onImportText: (text: string) => { ok: boolean; message: string }
  onQuickBookmark: () => { ok: boolean; message: string }
}

export function SceneShareControls({
  disabled,
  onExportJson,
  onCopyLink,
  onImportText,
  onQuickBookmark,
}: SceneShareControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2800)
  }

  return (
    <div className="control-cluster wrap scene-share">
      <button
        type="button"
        disabled={disabled || busy}
        title="Download the current exploration state as JSON"
        onClick={() => {
          onExportJson()
          flash('Snapshot downloaded')
        }}
      >
        Export scene
      </button>
      <button
        type="button"
        disabled={disabled || busy}
        title="Copy a URL that restores this scene when opened"
        onClick={async () => {
          setBusy(true)
          try {
            const ok = await onCopyLink()
            flash(ok ? 'Share link copied' : 'Could not copy link')
          } finally {
            setBusy(false)
          }
        }}
      >
        Copy share link
      </button>
      <button
        type="button"
        className="primary"
        disabled={disabled || busy}
        title="Save a named bookmark of this scene in local browser storage"
        onClick={() => {
          const result = onQuickBookmark()
          flash(result.message)
        }}
      >
        Save bookmark
      </button>
      <button
        type="button"
        disabled={disabled || busy}
        title="Import a previously exported scene JSON"
        onClick={() => fileRef.current?.click()}
      >
        Import scene
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            const text = await file.text()
            const result = onImportText(text)
            flash(result.message)
          } catch {
            flash('Failed to read file')
          } finally {
            setBusy(false)
          }
        }}
      />
      {message && <span className="share-toast">{message}</span>}
    </div>
  )
}
