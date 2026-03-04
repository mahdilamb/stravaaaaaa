import { describe, it, expect } from 'vitest'
import { decodePolyline } from '../polyline'

describe('decodePolyline', () => {
  it('returns empty array for null', () => {
    expect(decodePolyline(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })

  it('decodes a valid polyline', () => {
    // Encodes roughly (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
    const result = decodePolyline(encoded)
    expect(result.length).toBe(3)
    expect(result[0][0]).toBeCloseTo(38.5, 1)
    expect(result[0][1]).toBeCloseTo(-120.2, 1)
  })

  it('handles garbage input without throwing', () => {
    // The polyline library decodes whatever bytes it can — just verify no crash
    expect(() => decodePolyline('!!!invalid!!!')).not.toThrow()
  })
})
