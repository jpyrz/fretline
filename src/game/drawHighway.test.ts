import { describe, expect, it } from 'vitest'
import {
  highwayLaneX,
  highwayTopY,
  highwayTrackWidth,
  projectHighwayProgress,
  travelSecondsForNoteSpeed,
  visibleNoteIndices,
} from './drawHighway'
import type { GameFrame, ParsedChart } from '../types/game'

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
  it('uses a shorter Clone Hero-style default on widescreen displays', () => {
    const height = 1000

    expect(highwayTopY(1600, height)).toBeCloseTo(422.5)
    expect(highwayTopY(1600, height, 100)).toBeCloseTo(40)
  })

  it('retains more playable depth on portrait screens', () => {
    const height = 1000

    expect(highwayTopY(500, height)).toBeCloseTo(210)
    expect(highwayTopY(1600, height)).toBeGreaterThan(
      highwayTopY(500, height),
    )
  })

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

  it('keeps lane guides centered through notes and receptors', () => {
    const viewportWidth = 1000
    const surfaceProgress = 1.16
    const surfaceDepth = projectHighwayProgress(surfaceProgress)

    for (const lane of [0, 1, 2, 3, 4] as const) {
      const topX = highwayLaneX(viewportWidth, lane, 0)
      const bottomX = highwayLaneX(viewportWidth, lane, surfaceProgress)

      for (const progress of [0.2, 0.5, 0.8, 1]) {
        const guideDepth = projectHighwayProgress(progress) / surfaceDepth
        const guideX = topX + (bottomX - topX) * guideDepth

        expect(guideX).toBeCloseTo(
          highwayLaneX(viewportWidth, lane, progress),
          6,
        )
      }
    }
  })
})

describe('highway render culling', () => {
  it('returns only the visible time window plus active sustains', () => {
    const notes = Array.from({ length: 1_000 }, (_, index) => ({
      tick: index * 192,
      timeSeconds: index * 0.5,
      lanes: [0] as const,
      open: false,
      sustainTicks: 0,
      sustainSeconds: 0,
      hopo: false,
      forced: false,
      tap: false,
    }))
    const chart = {
      notes,
    } as unknown as ParsedChart
    const frame = {
      visualTimeSeconds: 200,
      activeSustainIndices: [12],
    } as GameFrame

    const indices = visibleNoteIndices(chart, frame, 2)

    expect(indices).toContain(12)
    expect(indices).toContain(400)
    expect(indices).toContain(404)
    expect(indices.length).toBeLessThan(10)
    expect(indices).not.toContain(399)
    expect(indices).not.toContain(405)
  })
})
