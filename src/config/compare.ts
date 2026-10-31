/** Accent colours for multi-cell volume comparison (distinct, non-purple). */
export const COMPARE_ACCENTS = [
  '#e8c27a', // gold
  '#7eb6ff', // sky
  '#8fbf7f', // sage
  '#e09a7a', // clay
  '#9ec5c0', // mist
] as const

export const MAX_COMPARE_VOLUMES = 4

export function accentForIndex(index: number): string {
  return COMPARE_ACCENTS[index % COMPARE_ACCENTS.length]
}
