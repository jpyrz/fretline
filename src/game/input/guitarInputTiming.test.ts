import { describe, expect, it } from 'vitest'
import {
  HOPO_STRUM_LENIENCY_SECONDS,
  STRUM_BEFORE_FRET_LENIENCY_MS,
  isPendingStrumActive,
  isStrumInsideHopoLeniency,
} from './guitarInputTiming'

describe('HOPO strum leniency', () => {
  it('consumes a strum reported just after a HOPO fret transition', () => {
    expect(
      isStrumInsideHopoLeniency({
        lastHopoHitTime: 10,
        currentTime: 10.04,
        playbackRate: 1,
      }),
    ).toBe(true)
  })

  it('does not consume a later strum intended for another note', () => {
    expect(
      isStrumInsideHopoLeniency({
        lastHopoHitTime: 10,
        currentTime: 10 + HOPO_STRUM_LENIENCY_SECONDS + 0.001,
        playbackRate: 1,
      }),
    ).toBe(false)
  })

  it('keeps the physical grace period stable in slow practice', () => {
    expect(
      isStrumInsideHopoLeniency({
        lastHopoHitTime: 10,
        currentTime: 10.02,
        playbackRate: 0.25,
      }),
    ).toBe(true)
    expect(
      isStrumInsideHopoLeniency({
        lastHopoHitTime: 10,
        currentTime: 10.021,
        playbackRate: 0.25,
      }),
    ).toBe(false)
  })
})

describe('strum-before-fret leniency', () => {
  it('keeps an unmatched strum alive briefly for its fret input', () => {
    expect(isPendingStrumActive(1_000, 1_040)).toBe(true)
    expect(
      isPendingStrumActive(
        1_000,
        1_000 + STRUM_BEFORE_FRET_LENIENCY_MS + 1,
      ),
    ).toBe(false)
  })
})
