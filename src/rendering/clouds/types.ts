/** Procedural cloud shader / volume knobs (derived reconstruction aids). */
export interface CloudParams {
  density: number
  verticalDevelopment: number
  horizontalScale: number
  anvilExtent: number
  edgeSoftness: number
  turbulence: number
  fineDetail: number
  cloudTopStructure: number
  lightingResponse: number
  seed: number
}
