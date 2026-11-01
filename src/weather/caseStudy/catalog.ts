import { CASE_STUDY_FEED } from '../../config/weather'
import { fetchCaseStudyPack } from './parseCaseStudy'
import type { CaseStudyPack } from './types'

export type CaseStudyLicenseKind = 'example-fixture' | 'user-licensed'

export interface CaseStudyCatalogEntry {
  id: string
  title: string
  region: string
  focusObservedAt: string
  path: string
  license: CaseStudyLicenseKind
  licenseNote: string
  summary: string
  sensors: { tracks: number; lightning: number; truthCells: number }
}

export interface CaseStudyCatalog {
  version: 1
  title: string
  provenance: { kind: string; summary: string; sourceId?: string }
  entries: CaseStudyCatalogEntry[]
}

export function catalogPath(): string {
  return CASE_STUDY_FEED.catalogPath
}

export async function fetchCaseStudyCatalog(signal?: AbortSignal): Promise<CaseStudyCatalog> {
  const res = await fetch(catalogPath(), {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Case study catalog request failed (${res.status})`)
  const data = (await res.json()) as CaseStudyCatalog
  if (data.version !== 1 || !Array.isArray(data.entries)) {
    throw new Error('Invalid case study catalog')
  }
  return data
}

export async function fetchCaseStudyFromCatalog(
  entry: CaseStudyCatalogEntry,
  signal?: AbortSignal,
): Promise<CaseStudyPack> {
  return fetchCaseStudyPack(entry.path, signal)
}

export function findCatalogEntry(
  catalog: CaseStudyCatalog | null,
  id: string,
): CaseStudyCatalogEntry | null {
  return catalog?.entries.find((e) => e.id === id) ?? null
}
