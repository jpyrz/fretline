import { describe, expect, it } from 'vitest'
import {
  TouchWhammyTracker,
  whammyAmountForDrag,
} from './touchWhammy'

describe('touch whammy', () => {
  it('ignores thumb jitter before beginning the bend', () => {
    expect(whammyAmountForDrag(700, 696, 100)).toBe(0)
    expect(whammyAmountForDrag(700, 690, 100)).toBe(0)
  })

  it('maps an upward lane drag to the full whammy range', () => {
    expect(whammyAmountForDrag(700, 645, 100)).toBeCloseTo(0.5)
    expect(whammyAmountForDrag(700, 600, 100)).toBe(1)
  })

  it('uses the strongest active chord contact and resets on release', () => {
    const tracker = new TouchWhammyTracker()
    tracker.press(1, 700)
    tracker.press(2, 700)

    expect(tracker.move(1, 672, 100)).toBeCloseTo(0.2)
    expect(tracker.move(2, 645, 100)).toBeCloseTo(0.5)
    expect(tracker.release(2)).toBeCloseTo(0.2)
    expect(tracker.release(1)).toBe(0)
  })
})
