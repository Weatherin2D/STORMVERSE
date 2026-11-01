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
