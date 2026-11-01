import { parseCaseStudyPack } from './parseCaseStudy'
import type { CaseStudyImportAttestation, CaseStudyPack } from './types'

export const CASE_STUDY_SHELF_KEY = 'stormverse.caseStudyShelf.v1'
export const MAX_CASE_STUDY_SHELF = 12

export interface CaseStudyShelfEntry {
  shelfId: string
  savedAt: string
  updatedAt: string
  attestation: CaseStudyImportAttestation
  /** Document shape accepted by parseCaseStudyPack. */
  document: unknown
}

export interface CaseStudyShelfListItem {
  shelfId: string
  packId: string
  title: string
  region: string
  savedAt: string
  updatedAt: string
  licenceNote: string
  sourceFilename?: string
  sensors: { tracks: number; lightning: number; truthCells: number }
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `shelf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function parseAttestation(raw: unknown): CaseStudyImportAttestation | null {
  const o = asRecord(raw)
  if (!o) return null
  if (o.attestedByUser !== true) return null
  if (typeof o.licenceNote !== 'string' || !o.licenceNote.trim()) return null
  if (typeof o.attestedAt !== 'string') return null
  return {
    attestedAt: o.attestedAt,
    licenceNote: o.licenceNote.trim().slice(0, 500),
    sourceFilename: typeof o.sourceFilename === 'string' ? o.sourceFilename : undefined,
    attestedByUser: true,
  }
}

/** Serialize a loaded pack back into a parseable case-study document. */
export function packToCaseStudyDocument(pack: CaseStudyPack): Record<string, unknown> {
  return {
    version: pack.version,
    id: pack.id,
    title: pack.title,
    region: pack.region,
    focusObservedAt: pack.focusObservedAt,
    timeRange: pack.timeRange,
    focus: pack.focus,
    provenance: pack.provenance,
    sourcePath: pack.sourcePath,
    importAttestation: pack.importAttestation,
    tracks: pack.tracks.map((t) => ({
      id: t.id,
      stormId: t.stormId,
      observedAt: t.observedAt,
      sourceId: t.sourceId,
      confidence: t.confidence,
      points: t.points,
      provenance: t.provenance,
    })),
    lightning: {
      type: 'FeatureCollection',
      features: pack.lightning.map((ev) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates:
            ev.altitudeM != null
              ? [ev.longitude, ev.latitude, ev.altitudeM]
              : [ev.longitude, ev.latitude],
        },
        properties: {
          id: ev.id,
          time: ev.observedAt,
          observedAt: ev.observedAt,
          peakCurrentKa: ev.peakCurrentKa,
          classification: ev.classification,
          qualityScore: ev.qualityScore,
          network: ev.network,
          polarity: ev.polarity,
          multiplicity: ev.multiplicity,
          locationErrorKm: ev.locationErrorKm,
          source: ev.sourceId,
          note: ev.provenance.qualityNote,
        },
      })),
    },
    truthCells: {
      type: 'FeatureCollection',
      features: pack.truthCells.map((c) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [c.longitude, c.latitude],
        },
        properties: {
          id: c.id,
          stormId: c.stormId,
          observedAt: c.observedAt,
          time: c.observedAt,
          label: c.label,
          source: c.sourceId,
          note: c.provenance.qualityNote,
        },
      })),
    },
  }
}

function hydrateEntry(raw: unknown): CaseStudyShelfEntry | null {
  const o = asRecord(raw)
  if (!o || typeof o.shelfId !== 'string') return null
  const attestation = parseAttestation(o.attestation)
  if (!attestation) return null
  // Prefer stored document; fall back to legacy `pack` field if present.
  const document = o.document ?? o.pack
  const parsed = parseCaseStudyPack(document)
  if (!parsed) return null
  return {
    shelfId: o.shelfId,
    savedAt: typeof o.savedAt === 'string' ? o.savedAt : attestation.attestedAt,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : attestation.attestedAt,
    attestation,
    document,
  }
}

function readAll(): CaseStudyShelfEntry[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(CASE_STUDY_SHELF_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(hydrateEntry)
      .filter((e): e is CaseStudyShelfEntry => e != null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

function writeAll(entries: CaseStudyShelfEntry[]): { ok: boolean; message?: string } {
  if (!canUseStorage()) {
    return { ok: false, message: 'localStorage unavailable — shelf not persisted' }
  }
  try {
    window.localStorage.setItem(
      CASE_STUDY_SHELF_KEY,
      JSON.stringify(entries.slice(0, MAX_CASE_STUDY_SHELF)),
    )
    return { ok: true }
  } catch {
    return {
      ok: false,
      message: 'Shelf storage full or blocked — import loaded but not saved locally',
    }
  }
}

function entryToListItem(entry: CaseStudyShelfEntry): CaseStudyShelfListItem | null {
  const pack = parseCaseStudyPack(entry.document)
  if (!pack) return null
  return {
    shelfId: entry.shelfId,
    packId: pack.id,
    title: pack.title,
    region: pack.region,
    savedAt: entry.savedAt,
    updatedAt: entry.updatedAt,
    licenceNote: entry.attestation.licenceNote,
    sourceFilename: entry.attestation.sourceFilename,
    sensors: {
      tracks: pack.tracks.length,
      lightning: pack.lightning.length,
      truthCells: pack.truthCells.length,
    },
  }
}

export function listCaseStudyShelf(): CaseStudyShelfListItem[] {
  return readAll()
    .map(entryToListItem)
    .filter((e): e is CaseStudyShelfListItem => e != null)
}

export function loadCaseStudyFromShelf(shelfId: string): CaseStudyPack | null {
  const entry = readAll().find((e) => e.shelfId === shelfId)
  if (!entry) return null
  const pack = parseCaseStudyPack(entry.document, entry.attestation.sourceFilename)
  if (!pack) return null
  return {
    ...pack,
    importAttestation: pack.importAttestation ?? entry.attestation,
    sourcePath: pack.sourcePath ?? `shelf://${entry.shelfId}`,
    provenance: {
      ...pack.provenance,
      qualityNote: [
        pack.provenance.qualityNote,
        `Shelved attestation: ${entry.attestation.licenceNote}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  }
}

/**
 * Persist an attested pack. Upserts by pack.id. Refuses packs without attestation.
 */
export function saveCaseStudyToShelf(pack: CaseStudyPack): {
  ok: boolean
  entry?: CaseStudyShelfListItem
  message: string
} {
  const attestation = pack.importAttestation
  if (!attestation?.attestedByUser || !attestation.licenceNote.trim()) {
    return {
      ok: false,
      message: 'Only attested imports can be saved to the local shelf',
    }
  }
  const now = new Date().toISOString()
  const document = packToCaseStudyDocument(pack)
  const existing = readAll()
  const prior = existing.find((e) => {
    const p = parseCaseStudyPack(e.document)
    return p?.id === pack.id
  })
  const entry: CaseStudyShelfEntry = {
    shelfId: prior?.shelfId ?? newId(),
    savedAt: prior?.savedAt ?? now,
    updatedAt: now,
    attestation,
    document,
  }
  const next = [
    entry,
    ...existing.filter((e) => {
      const p = parseCaseStudyPack(e.document)
      return p?.id !== pack.id
    }),
  ].slice(0, MAX_CASE_STUDY_SHELF)
  const written = writeAll(next)
  if (!written.ok) {
    return { ok: false, message: written.message ?? 'Failed to write shelf' }
  }
  const listItem = entryToListItem(entry)
  return {
    ok: true,
    entry: listItem ?? undefined,
    message: prior
      ? `Updated “${pack.title}” on local shelf`
      : `Saved “${pack.title}” to local shelf`,
  }
}

export function deleteCaseStudyFromShelf(shelfId: string): boolean {
  const all = readAll()
  const next = all.filter((e) => e.shelfId !== shelfId)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

export function clearCaseStudyShelf(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(CASE_STUDY_SHELF_KEY)
}

function safeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'case-study'
}

/** Pretty-printed JSON for an attested pack (includes importAttestation). */
export function caseStudyPackToExportJson(pack: CaseStudyPack): string {
  if (!pack.importAttestation?.attestedByUser) {
    throw new Error('Only attested imports can be exported with attestation metadata')
  }
  return `${JSON.stringify(packToCaseStudyDocument(pack), null, 2)}\n`
}

export function downloadCaseStudyPack(
  pack: CaseStudyPack,
  filename?: string,
): { ok: boolean; message: string } {
  try {
    const payload = caseStudyPackToExportJson(pack)
    const name =
      filename ??
      `stormverse-${safeFilenamePart(pack.id)}-attested.json`
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true, message: `Exported “${pack.title}” with attestation metadata` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Case study export failed',
    }
  }
}

export function downloadCaseStudyFromShelf(
  shelfId: string,
  filename?: string,
): { ok: boolean; message: string } {
  const pack = loadCaseStudyFromShelf(shelfId)
  if (!pack) {
    return { ok: false, message: 'Shelved case study not found or invalid' }
  }
  const entry = listCaseStudyShelf().find((e) => e.shelfId === shelfId)
  const suggested =
    filename ??
    `stormverse-${safeFilenamePart(pack.id)}-attested.json`
  const result = downloadCaseStudyPack(pack, suggested)
  if (result.ok && entry?.sourceFilename) {
    return {
      ok: true,
      message: `${result.message} (from ${entry.sourceFilename})`,
    }
  }
  return result
}

export const CASE_STUDY_SHELF_BACKUP_VERSION = 1 as const

export interface CaseStudyShelfBackup {
  kind: 'stormverse.caseStudyShelfBackup'
  version: typeof CASE_STUDY_SHELF_BACKUP_VERSION
  exportedAt: string
  /** Optional note from the exporter (not a rights attestation). */
  note?: string
  entries: Array<{
    shelfId: string
    savedAt: string
    updatedAt: string
    attestation: CaseStudyImportAttestation
    document: unknown
  }>
}

export interface CaseStudyShelfRestoreAttestation {
  attestedAt: string
  licenceNote: string
  sourceFilename?: string
  attestedByUser: true
}

export function buildCaseStudyShelfBackup(note?: string): CaseStudyShelfBackup {
  const entries = readAll().map((e) => ({
    shelfId: e.shelfId,
    savedAt: e.savedAt,
    updatedAt: e.updatedAt,
    attestation: e.attestation,
    document: e.document,
  }))
  return {
    kind: 'stormverse.caseStudyShelfBackup',
    version: CASE_STUDY_SHELF_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    note: note?.trim() ? note.trim().slice(0, 500) : undefined,
    entries,
  }
}

export function caseStudyShelfBackupToJson(backup: CaseStudyShelfBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function downloadCaseStudyShelfBackup(
  filename = 'stormverse-case-study-shelf-backup.json',
): { ok: boolean; message: string } {
  const backup = buildCaseStudyShelfBackup()
  if (backup.entries.length === 0) {
    return { ok: false, message: 'Local shelf is empty — nothing to back up' }
  }
  try {
    const blob = new Blob([caseStudyShelfBackupToJson(backup)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return {
      ok: true,
      message: `Backed up ${backup.entries.length} shelved pack${backup.entries.length === 1 ? '' : 's'}`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Shelf backup failed',
    }
  }
}

function parseShelfBackup(raw: unknown): CaseStudyShelfBackup {
  const o = asRecord(raw)
  if (!o) throw new Error('Shelf backup is not a JSON object')
  if (o.kind !== 'stormverse.caseStudyShelfBackup') {
    throw new Error('Not a STORMVERSE case-study shelf backup')
  }
  if (o.version !== CASE_STUDY_SHELF_BACKUP_VERSION) {
    throw new Error('Unsupported shelf backup version')
  }
  if (!Array.isArray(o.entries)) throw new Error('Shelf backup entries missing')
  const entries: CaseStudyShelfBackup['entries'] = []
  for (const item of o.entries) {
    const hydrated = hydrateEntry(item)
    if (!hydrated) {
      throw new Error('Shelf backup contains an invalid or unattested entry')
    }
    entries.push({
      shelfId: hydrated.shelfId,
      savedAt: hydrated.savedAt,
      updatedAt: hydrated.updatedAt,
      attestation: hydrated.attestation,
      document: hydrated.document,
    })
  }
  return {
    kind: 'stormverse.caseStudyShelfBackup',
    version: CASE_STUDY_SHELF_BACKUP_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date(0).toISOString(),
    note: typeof o.note === 'string' ? o.note : undefined,
    entries,
  }
}

export function parseCaseStudyShelfBackupFromText(text: string): CaseStudyShelfBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Shelf backup file is not valid JSON')
  }
  return parseShelfBackup(raw)
}

/**
 * Restore a portable shelf backup. Requires a fresh restore attestation.
 * Merges by pack id (upsert); caps at MAX_CASE_STUDY_SHELF.
 */
export function restoreCaseStudyShelfBackup(
  text: string,
  opts: { licenceNote: string; sourceFilename?: string; replace?: boolean },
): { ok: boolean; message: string; restored: number; skipped: number } {
  const licenceNote = opts.licenceNote.trim()
  if (!licenceNote) {
    return {
      ok: false,
      message: 'Licence / rights note is required to restore a shelf backup',
      restored: 0,
      skipped: 0,
    }
  }

  let backup: CaseStudyShelfBackup
  try {
    backup = parseCaseStudyShelfBackupFromText(text)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid shelf backup',
      restored: 0,
      skipped: 0,
    }
  }

  if (backup.entries.length === 0) {
    return { ok: false, message: 'Shelf backup has no entries', restored: 0, skipped: 0 }
  }

  const restoreAttestation: CaseStudyShelfRestoreAttestation = {
    attestedAt: new Date().toISOString(),
    licenceNote: licenceNote.slice(0, 500),
    sourceFilename: opts.sourceFilename,
    attestedByUser: true,
  }

  const incoming: CaseStudyShelfEntry[] = backup.entries.map((e) => {
    // Stamp restore attestation into pack provenance via document merge when possible.
    const doc = asRecord(e.document) ?? {}
    const priorProv = asRecord(doc.provenance)
    return {
      shelfId: e.shelfId || newId(),
      savedAt: e.savedAt,
      updatedAt: new Date().toISOString(),
      attestation: e.attestation,
      document: {
        ...doc,
        importAttestation: e.attestation,
        provenance: {
          ...(priorProv ?? {}),
          summary:
            typeof priorProv?.summary === 'string'
              ? `${priorProv.summary} Restored from shelf backup with user attestation.`
              : 'Restored from shelf backup with user attestation.',
          qualityNote: [
            typeof priorProv?.qualityNote === 'string' ? priorProv.qualityNote : undefined,
            `Original attestation: ${e.attestation.licenceNote}`,
            `Restore attestation: ${restoreAttestation.licenceNote}`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      },
    }
  })

  // Re-validate after provenance stamp
  const valid = incoming
    .map((e) => hydrateEntry(e))
    .filter((e): e is CaseStudyShelfEntry => e != null)

  if (valid.length === 0) {
    return {
      ok: false,
      message: 'No valid attested entries could be restored',
      restored: 0,
      skipped: backup.entries.length,
    }
  }

  const existing = opts.replace ? [] : readAll()
  const byPackId = new Map<string, CaseStudyShelfEntry>()
  for (const e of existing) {
    const pack = parseCaseStudyPack(e.document)
    if (pack) byPackId.set(pack.id, e)
  }

  let restored = 0
  let skipped = 0
  for (const e of valid) {
    const pack = parseCaseStudyPack(e.document)
    if (!pack) {
      skipped += 1
      continue
    }
    const prior = byPackId.get(pack.id)
    byPackId.set(pack.id, {
      ...e,
      shelfId: prior?.shelfId ?? e.shelfId ?? newId(),
      savedAt: prior?.savedAt ?? e.savedAt,
    })
    restored += 1
  }

  const merged = Array.from(byPackId.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CASE_STUDY_SHELF)

  const written = writeAll(merged)
  if (!written.ok) {
    return {
      ok: false,
      message: written.message ?? 'Failed to write restored shelf',
      restored: 0,
      skipped: backup.entries.length,
    }
  }

  const dropped = Math.max(0, byPackId.size - merged.length)
  const suffix = [
    skipped ? `${skipped} skipped` : null,
    dropped ? `${dropped} over shelf cap` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    ok: true,
    message: opts.replace
      ? `Replaced shelf with ${restored} pack${restored === 1 ? '' : 's'} from backup`
      : `Restored ${restored} pack${restored === 1 ? '' : 's'} into local shelf${suffix ? ` (${suffix})` : ''}`,
    restored,
    skipped: skipped + dropped,
  }
}
