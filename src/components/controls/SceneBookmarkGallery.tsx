import { useMemo, useState } from 'react'
import type { SceneBookmarkListItem } from '../../lib/sceneBookmarks'

interface SceneBookmarkGalleryProps {
  disabled?: boolean
  bookmarks: SceneBookmarkListItem[]
  onRefresh: () => void
  onSave: (name: string) => { ok: boolean; message: string }
  onRestore: (id: string) => { ok: boolean; message: string }
  onRename: (id: string, name: string) => { ok: boolean; message: string }
  onDelete: (id: string) => { ok: boolean; message: string }
}

export function SceneBookmarkGallery({
  disabled,
  bookmarks,
  onRefresh,
  onSave,
  onRestore,
  onRename,
  onDelete,
}: SceneBookmarkGalleryProps) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2800)
  }

  const sorted = useMemo(
    () => [...bookmarks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [bookmarks],
  )

  return (
    <div className="bookmark-gallery" aria-label="Saved scene bookmarks">
      <div className="bookmark-gallery-header">
        <h3>Saved scenes</h3>
        <span className="provenance">{sorted.length} bookmark{sorted.length === 1 ? '' : 's'} · local only</span>
      </div>
      <p className="provenance">
        Named bookmarks stay in this browser’s local storage. They restore UI/compare state against
        live radar — they do not freeze weather fields.
      </p>

      <div className="bookmark-save-row">
        <input
          type="text"
          value={name}
          maxLength={80}
          placeholder="Name this scene…"
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const result = onSave(name)
            flash(result.message)
            if (result.ok) {
              setName('')
              onRefresh()
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => {
            const result = onSave(name)
            flash(result.message)
            if (result.ok) {
              setName('')
              onRefresh()
            }
          }}
        >
          Save bookmark
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="provenance">No bookmarks yet — save a compare set or pinned volume to revisit.</p>
      ) : (
        <ul className="bookmark-list">
          {sorted.map((b) => (
            <li key={b.id}>
              {editingId === b.id ? (
                <div className="bookmark-edit-row">
                  <input
                    type="text"
                    value={editName}
                    maxLength={80}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingId(null)
                        return
                      }
                      if (e.key !== 'Enter') return
                      const result = onRename(b.id, editName)
                      flash(result.message)
                      if (result.ok) {
                        setEditingId(null)
                        onRefresh()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const result = onRename(b.id, editName)
                      flash(result.message)
                      if (result.ok) {
                        setEditingId(null)
                        onRefresh()
                      }
                    }}
                  >
                    OK
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="bookmark-meta">
                    <strong>{b.name}</strong>
                    <span>
                      {b.viewMode}
                      {b.compareCount > 0 ? ` · ${b.compareCount} compare` : ''}
                      {b.pinnedVolumeMode === 'cell' ? ' · pinned' : ''}
                      {b.observedAt
                        ? ` · ${b.observedAt.replace('T', ' ').replace('.000Z', 'Z').slice(0, 19)}`
                        : ''}
                    </span>
                  </div>
                  <div className="bookmark-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={disabled}
                      onClick={() => {
                        const result = onRestore(b.id)
                        flash(result.message)
                      }}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setEditingId(b.id)
                        setEditName(b.name)
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const result = onDelete(b.id)
                        flash(result.message)
                        if (result.ok) onRefresh()
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <span className="share-toast">{message}</span>}
    </div>
  )
}
