import { describe, expect, it } from 'vitest'
import {
  fretEntranceProgress,
  fretEntranceTransform,
} from './fretEntrance'

describe('fret entrance animation', () => {
  it('staggers the receptors from green to orange', () => {
    expect(fretEntranceProgress(-2.8, 0)).toBeGreaterThan(0)
    expect(fretEntranceProgress(-2.8, 4)).toBe(0)
  })

  it('settles every receptor before the countdown reaches two', () => {
    expect(fretEntranceProgress(-2.2, 0)).toBe(1)
    expect(fretEntranceProgress(-2.2, 4)).toBe(1)
  })

  it('starts above and smaller than its resting position', () => {
    expect(fretEntranceTransform(-3, 0)).toEqual({
      opacity: 0,
      offsetScale: -4.8,
      sizeScale: 0.74,
    })
  })

  it('finishes at the receptor resting position and size', () => {
    const settled = fretEntranceTransform(0, 4)
    expect(settled.opacity).toBe(1)
    expect(settled.offsetScale).toBeCloseTo(0)
    expect(settled.sizeScale).toBeCloseTo(1)
  })
})
