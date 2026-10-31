/** How a visual or data feature relates to meteorological reality. */
export type ProvenanceKind =
  | 'direct'
  | 'processed'
  | 'derived'
  | 'model'
  | 'procedural'
  | 'synthetic'

export interface Provenance {
  kind: ProvenanceKind
  /** Short human-readable explanation shown in the UI. */
  summary: string
  sourceId?: string
  observedAt?: string
  latencySec?: number
  qualityNote?: string
}
