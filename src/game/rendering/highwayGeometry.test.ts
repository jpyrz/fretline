import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HIT_LINE_RATIO,
  TAP_HIT_LINE_RATIO,
  highwayGuideWidthAtY,
  highwayLaneX,
  highwayPoint,
  highwayTopY,
  highwayTrackWidth,
  projectHighwayProgress,
  travelSecondsForNoteSpeed,
} from './highwayGeometry'

describe('highway geometry', () => {
  it('projects every lane through the same perspective model', () => {
    const width = 1000
    const height = 800
    const progress = 0.72
    const point = highwayPoint(width, height, progress)
    const laneWidth = point.trackWidth / 5

    for (const lane of [0, 1, 2, 3, 4] as const) {
      expect(highwayLaneX(width, lane, progress)).toBeCloseTo(
        point.center - point.trackWidth / 2 + laneWidth * (lane + 0.5),
      )
    }
  })

  it('retains the established note-speed and responsive-width behavior', () => {
    expect(travelSecondsForNoteSpeed(12)).toBeCloseTo(1.8)
    expect(projectHighwayProgress(1)).toBe(1)
    expect(highwayTrackWidth(1400, 1)).toBe(760)
    expect(highwayTopY(1600, 1000)).toBeCloseTo(422.5)
  })

  it('raises only the Tap Mode judgment line', () => {
    const standard = highwayPoint(
      390,
      844,
      1,
      undefined,
      DEFAULT_HIT_LINE_RATIO,
    )
    const tap = highwayPoint(
      390,
      844,
      1,
      undefined,
      TAP_HIT_LINE_RATIO,
    )

    expect(standard.hitY).toBeCloseTo(844 * 0.89)
    expect(tap.hitY).toBeCloseTo(844 * 0.76)
    expect(standard.hitY - tap.hitY).toBeCloseTo(844 * 0.13)
  })

  it('keeps a lower Tap target row centered on the flared lane guides', () => {
    const width = 390
    const height = 844
    const strike = highwayPoint(
      width,
      height,
      1,
      undefined,
      TAP_HIT_LINE_RATIO,
    )
    const surfaceEnd = highwayPoint(
      width,
      height,
      1.18,
      undefined,
      TAP_HIT_LINE_RATIO,
    )

    expect(
      highwayGuideWidthAtY(
        width,
        height,
        strike.y,
        undefined,
        TAP_HIT_LINE_RATIO,
      ),
    ).toBeCloseTo(strike.trackWidth)
    expect(
      highwayGuideWidthAtY(
        width,
        height,
        surfaceEnd.y,
        undefined,
        TAP_HIT_LINE_RATIO,
      ),
    ).toBeCloseTo(surfaceEnd.trackWidth)
  })
})
