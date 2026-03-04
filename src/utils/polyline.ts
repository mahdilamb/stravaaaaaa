import polyline from '@mapbox/polyline'

export function decodePolyline(encoded: string | null): [number, number][] {
  if (!encoded) return []
  try {
    return polyline.decode(encoded)
  } catch {
    return []
  }
}
