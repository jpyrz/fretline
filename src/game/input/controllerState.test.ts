import { describe, expect, it } from 'vitest'
import { normalizePerformanceTimestamp } from './controllerState'

describe('controller timestamps', () => {
  it('preserves performance-relative timestamps', () => {
    expect(normalizePerformanceTimestamp(123.45)).toBe(123.45)
  })

  it('normalizes epoch-like controller timestamps', () => {
    const timestamp = performance.timeOrigin + 456.78
    expect(normalizePerformanceTimestamp(timestamp)).toBeCloseTo(456.78)
  })
})
