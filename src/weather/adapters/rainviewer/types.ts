export interface RainViewerFrame {
  time: number
  path: string
}

export interface RainViewerMapsResponse {
  version: string
  generated: number
  host: string
  radar: {
    past: RainViewerFrame[]
    nowcast: RainViewerFrame[]
  }
  satellite: {
    infrared: RainViewerFrame[]
  }
}
