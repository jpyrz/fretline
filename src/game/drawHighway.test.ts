import { describe, expect, it } from 'vitest'
import {
  highwayTrackWidth,
  projectHighwayProgress,
  travelSecondsForNoteSpeed,
} from './drawHighway'

describe('highway note speed', () => {
  it('creates more visual spacing by shortening travel time', () => {
    expect(travelSecondsForNoteSpeed(6)).toBeCloseTo(2.4)
    expect(travelSecondsForNoteSpeed(12)).toBeCloseTo(1.8)
    expect(travelSecondsForNoteSpeed(18)).toBeCloseTo(1.2)
  })

  it('clamps out-of-range stored settings', () => {
    expect(travelSecondsForNoteSpeed(-20)).toBeCloseTo(2.4)
    expect(travelSecondsForNoteSpeed(99)).toBeCloseTo(1.2)
  })
})

describe('highway perspective', () => {
  it('creates increasing screen-space separation near the strike line', () => {
    const farGap =
      projectHighwayProgress(0.2) - projectHighwayProgress(0.1)
    const nearGap =
      projectHighwayProgress(1) - projectHighwayProgress(0.9)

    expect(nearGap).toBeGreaterThan(farGap * 2)
  })

  it('caps the desktop track while preserving responsive mobile width', () => {
    expect(highwayTrackWidth(1000, 1)).toBe(760)
    expect(highwayTrackWidth(1400, 1)).toBe(760)
    expect(highwayTrackWidth(400, 1)).toBeCloseTo(352)
    expect(highwayTrackWidth(1000, 0)).toBeCloseTo(197.6)
  })
})
