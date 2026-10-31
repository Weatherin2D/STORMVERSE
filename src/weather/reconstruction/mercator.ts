/** Web Mercator helpers for XYZ radar tiles. */

export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y }
}

export function tilePixelToLonLat(
  z: number,
  tileX: number,
  tileY: number,
  px: number,
  py: number,
  size = 256,
): { lon: number; lat: number } {
  const n = 2 ** z
  const x = (tileX + px / size) / n
  const y = (tileY + py / size) / n
  const lon = x * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)))
  const lat = (latRad * 180) / Math.PI
  return { lon, lat }
}

export function australiaTileRange(z: number): { x0: number; x1: number; y0: number; y1: number } {
  const nw = lonLatToTile(112, -12, z)
  const se = lonLatToTile(154, -44, z)
  return {
    x0: Math.min(nw.x, se.x),
    x1: Math.max(nw.x, se.x),
    y0: Math.min(nw.y, se.y),
    y1: Math.max(nw.y, se.y),
  }
}
