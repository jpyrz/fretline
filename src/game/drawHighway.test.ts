import { describe, expect, it } from 'vitest'
import { travelSecondsForNoteSpeed } from './drawHighway'

describe('highway note speed', () => {
  it('creates more visual spacing by shortening travel time', () => {
    expect(travelSecondsForNoteSpeed(6)).toBeCloseTo(2.46)
    expect(travelSecondsForNoteSpeed(12)).toBeCloseTo(1.92)
    expect(travelSecondsForNoteSpeed(18)).toBeCloseTo(1.38)
  })

  it('clamps out-of-range stored settings', () => {
    expect(travelSecondsForNoteSpeed(-20)).toBeCloseTo(2.46)
    expect(travelSecondsForNoteSpeed(99)).toBeCloseTo(1.38)
  })
})
