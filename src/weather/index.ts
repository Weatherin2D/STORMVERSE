export * from './types/provenance'
export * from './types/observations'
export * from './providers/types'
export { PrototypeWeatherProvider, prototypeProvider } from './adapters/PrototypeAdapter'
export {
  AustralianWeatherProvider,
  australianWeatherProvider,
} from './adapters/AustralianWeatherAdapter'
export { fetchOpenMeteoEnvironment } from './adapters/OpenMeteoAdapter'
export type { EnvironmentalProfile } from './adapters/OpenMeteoAdapter'
export { deriveTracksFromRadarFrames } from './reconstruction/deriveTracks'
export {
  mapEnvironmentToReconstruction,
  type ReconstructionTarget,
} from './reconstruction/mapToCloudParams'
export {
  interpolateTrackAtCursor,
  interpolateTrackAtUnix,
  radarCursorToUnix,
  type TrackPose,
} from './reconstruction/interpolateTrack'
export {
  scoreTrack,
  scoreTracks,
  summarizeTrackSkills,
  type TrackSkillGrade,
  type TrackSkillScore,
  type TrackSkillSummary,
} from './reconstruction/trackSkill'
export {
  GeoJsonLightningProvider,
  createLightningProviderFromEnv,
  parseLightningFeatureCollection,
  sampleLightningUrl,
} from './adapters/GeoJsonLightningAdapter'
export {
  DEFAULT_LIGHTNING_FILTER,
  eventPassesLightningFilter,
  filterLightningEvents,
  lightningMarkerColor,
  normalizeQualityScore,
  summarizeLightningQuality,
  type LightningQualityFilter,
  type LightningQualitySummary,
} from './reconstruction/lightningQuality'
export {
  buildCrossProductReport,
  lightningInObservationWindow,
  lightningNearTrack,
  DEFAULT_CROSS_PRODUCT_TIME_WINDOW_SEC,
  DEFAULT_CROSS_PRODUCT_NEAR_TRACK_KM,
  type CrossProductReport,
  type CrossProductFeedStatus,
  type CrossProductInputs,
} from './reconstruction/crossProductQuality'
export {
  parseCaseStudyPack,
  fetchCaseStudyPack,
} from './caseStudy/parseCaseStudy'
export {
  CASE_STUDY_VERSION,
  type CaseStudyMeta,
  type CaseStudyPack,
  type LightningSyncMode,
} from './caseStudy/types'
export {
  GeoJsonTruthCellsProvider,
  createTruthCellsProviderFromEnv,
  sampleTruthCellsUrl,
  tracksToTruthGeoJson,
  downloadTruthCellsTemplate,
  truthCellsFromTracks,
} from './adapters/GeoJsonTruthCellsAdapter'
export {
  haversineKm,
  matchTracksToTruth,
  summarizeTrackTruth,
  type TruthCell,
  type TrackTruthMatch,
  type TrackTruthSummary,
  type TruthMatchOptions,
} from './reconstruction/trackTruth'
