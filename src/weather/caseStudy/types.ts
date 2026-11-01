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

export interface CaseStudyPack extends CaseStudyMeta {
  version: typeof CASE_STUDY_VERSION
  lightning: LightningObservation[]
  truthCells: TruthCell[]
  tracks: StormTrack[]
}

export type LightningSyncMode = 'off' | 'radar' | 'case'
