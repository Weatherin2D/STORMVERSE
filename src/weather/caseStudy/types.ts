import type { LightningObservation, StormTrack } from '../types/observations'
import type { Provenance } from '../types/provenance'
import type { TruthCell } from '../reconstruction/trackTruth'

export const CASE_STUDY_VERSION = 1 as const

export interface CaseStudyMeta {
  id: string
  title: string
  region: string
  focusObservedAt: string
  timeRange: { start: string; end: string }
  focus: { longitude: number; latitude: number }
  provenance: Provenance
  sourcePath?: string
}

/** User attestation recorded when importing a local pack (M17). */
export interface CaseStudyImportAttestation {
  attestedAt: string
  /** Free-text licence / rights note supplied by the importer. */
  licenceNote: string
  sourceFilename?: string
  /** Always true when present — import UI refuses without explicit attestation. */
  attestedByUser: true
}

export interface CaseStudyPack extends CaseStudyMeta {
  version: typeof CASE_STUDY_VERSION
  lightning: LightningObservation[]
  truthCells: TruthCell[]
  tracks: StormTrack[]
  importAttestation?: CaseStudyImportAttestation
}

export type LightningSyncMode = 'off' | 'radar' | 'case'
