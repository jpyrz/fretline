import { describe, expect, it } from 'vitest'
import {
  newlyPressedStrumDirections,
  normalizePerformanceTimestamp,
} from './controllerState'

describe('controller timestamps', () => {
  it('preserves performance-relative timestamps', () => {
    expect(normalizePerformanceTimestamp(123.45)).toBe(123.45)
  })

  it('normalizes epoch-like controller timestamps', () => {
    const timestamp = performance.timeOrigin + 456.78
    expect(normalizePerformanceTimestamp(timestamp)).toBeCloseTo(456.78)
  })
})

describe('strum direction edges', () => {
  it('recognizes a direct down-to-up transition as another strum', () => {
    expect(
      newlyPressedStrumDirections(
        { up: true, down: false },
        { up: false, down: true },
      ),
    ).toEqual({ up: true, down: false })
  })

  it('does not repeat a held direction', () => {
    expect(
      newlyPressedStrumDirections(
        { up: false, down: true },
        { up: false, down: true },
      ),
    ).toEqual({ up: false, down: false })
  })
})
