/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_LIGHTNING_GEOJSON_URL?: string
  readonly VITE_TRUTH_CELLS_GEOJSON_URL?: string
  readonly VITE_CASE_STUDY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
