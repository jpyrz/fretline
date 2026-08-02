import { describe, expect, it } from 'vitest'
import {
  adjacentPracticeSpeed,
  formatPracticeSpeed,
  normalizePracticeSpeed,
} from './practiceMode'

describe('practice mode', () => {
  it('normalizes stored and routed speed values', () => {
    expect(normalizePracticeSpeed(0.5)).toBe(0.5)
    expect(normalizePracticeSpeed(0.55)).toBe(1)
    expect(normalizePracticeSpeed('0.5')).toBe(1)
  })

  it('formats and steps through supported speeds', () => {
    expect(formatPracticeSpeed(0.25)).toBe('25%')
    expect(adjacentPracticeSpeed(0.7, 1)).toBe(0.6)
    expect(adjacentPracticeSpeed(0.7, -1)).toBe(0.8)
    expect(adjacentPracticeSpeed(1, -1)).toBe(1)
  })
})
