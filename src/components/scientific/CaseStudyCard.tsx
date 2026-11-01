import { useRef, useState } from 'react'
import type { CaseStudyCatalog, CaseStudyCatalogEntry, CaseStudyPack } from '../../weather'
import type { LightningSyncMode } from '../../weather'
import { downloadCaseStudyTemplate } from '../../weather'

interface CaseStudyCardProps {
  caseStudy: CaseStudyPack | null
  catalog: CaseStudyCatalog | null
  catalogLoading?: boolean
  catalogError?: string | null
  loading?: boolean
  error?: string | null
  syncMode: LightningSyncMode
  disabled?: boolean
  onLoadById: (id: string) => void
  onImportText: (
    text: string,
    opts: { licenceNote: string; sourceFilename?: string },
  ) => { ok: boolean; message: string }
  onClear: () => void
  onSyncModeChange: (mode: LightningSyncMode) => void
}

function licenseBadge(entry: CaseStudyCatalogEntry): string {
  return entry.license === 'user-licensed' ? 'licensed' : 'example fixture'
}

export function CaseStudyCard({
  caseStudy,
  catalog,
  catalogLoading,
  catalogError,
  loading,
  error,
  syncMode,
  disabled,
  onLoadById,
  onImportText,
  onClear,
  onSyncModeChange,
}: CaseStudyCardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const entries = catalog?.entries ?? []
  const [licenceNote, setLicenceNote] = useState('')
  const [attested, setAttested] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const canImport = attested && licenceNote.trim().length > 0 && !disabled && !loading

  return (
    <div className="availability case-study-card">
      <h3>Case study library</h3>
      <p className="provenance">
        Time-aligned lightning + truth + reference-track packs. Bundled entries are example fixtures
        with documented (non-)licences — not BoM/commercial archives. Live radar continues separately.
      </p>

      {catalogLoading && <p className="provenance">Loading catalog…</p>}
      {catalogError && <p className="provenance verify-error">{catalogError}</p>}

      {entries.length > 0 && (
        <ul className="case-study-list">
          {entries.map((entry) => {
            const active = caseStudy?.id === entry.id
            return (
              <li key={entry.id} className={active ? 'active' : undefined}>
                <button
                  type="button"
                  className={active ? 'active' : undefined}
                  disabled={disabled || loading}
                  onClick={() => onLoadById(entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.region} · {entry.sensors.tracks} trk · {entry.sensors.lightning} lght ·{' '}
                    {entry.sensors.truthCells} truth
                  </span>
                  <span className="case-license">{licenseBadge(entry)}</span>
                </button>
                <p className="provenance case-entry-note">{entry.licenseNote}</p>
              </li>
            )
          })}
        </ul>
      )}

      <div className="case-import">
        <h4>Import your pack</h4>
        <p className="provenance">
          Upload a STORMVERSE case-study JSON. Import requires an explicit rights attestation — we
          do not scrape or invent archive data for you.
        </p>
        <label className="case-import-note">
          <span>Licence / rights note</span>
          <input
            type="text"
            maxLength={500}
            placeholder="e.g. Licensed BoM archive extract for internal research…"
            disabled={disabled}
            value={licenceNote}
            onChange={(e) => setLicenceNote(e.target.value)}
          />
        </label>
        <label className="lightning-check case-attest">
          <input
            type="checkbox"
            disabled={disabled}
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          <span>
            I attest I have the rights to use this pack in STORMVERSE and that it is not obtained by
            scraping restricted services.
          </span>
        </label>
        <div className="verify-actions">
          <button
            type="button"
            className="primary"
            disabled={!canImport}
            onClick={() => fileRef.current?.click()}
          >
            Import JSON…
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => downloadCaseStudyTemplate()}
          >
            Download template
          </button>
          <button type="button" disabled={disabled || !caseStudy} onClick={onClear}>
            Clear case study
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!attested || !licenceNote.trim()) {
              setImportMessage('Attestation and licence note are required before import')
              return
            }
            try {
              const text = await file.text()
              const result = onImportText(text, {
                licenceNote,
                sourceFilename: file.name,
              })
              setImportMessage(result.message)
              if (result.ok) {
                setAttested(false)
              }
            } catch {
              setImportMessage('Failed to read file')
            }
          }}
        />
        {importMessage && <p className="provenance">{importMessage}</p>}
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
          {caseStudy.importAttestation && (
            <p className="provenance">
              <strong>Import attestation:</strong> {caseStudy.importAttestation.licenceNote}
              {caseStudy.importAttestation.sourceFilename
                ? ` · file ${caseStudy.importAttestation.sourceFilename}`
                : ''}
              {' · '}
              {caseStudy.importAttestation.attestedAt}
            </p>
          )}
          <p className="provenance">
            <strong>Provenance:</strong> {caseStudy.provenance.summary}
          </p>
        </>
      ) : (
        !loading &&
        !catalogLoading && (
          <p className="provenance">
            No case study loaded. Pick a catalog entry or import a licensed pack with attestation.
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
