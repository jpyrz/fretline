import { describe, expect, it } from 'vitest'
import type { ChartNote } from '../types/game'
import {
  SUSTAIN_POINTS_PER_BEAT,
  sustainBasePointsAtTick,
  sustainReleaseExpired,
} from './scoring'

const sustain: ChartNote = {
  tick: 192,
  timeSeconds: 0.5,
  lanes: [0],
  open: false,
  sustainTicks: 384,
  sustainSeconds: 1,
  hopo: false,
  forced: false,
  tap: false,
}

describe('sustain scoring', () => {
  it('awards points by chart beats and caps them at the sustain end', () => {
    expect(sustainBasePointsAtTick(sustain, 191, 192)).toBe(0)
    expect(sustainBasePointsAtTick(sustain, 288, 192)).toBe(12)
    expect(sustainBasePointsAtTick(sustain, 576, 192)).toBe(
      SUSTAIN_POINTS_PER_BEAT * 2,
    )
    expect(sustainBasePointsAtTick(sustain, 900, 192)).toBe(
      SUSTAIN_POINTS_PER_BEAT * 2,
    )
  })

  it('allows a short fret-release grace period before breaking a hold', () => {
    expect(sustainReleaseExpired(null, 12)).toBe(false)
    expect(sustainReleaseExpired(10, 10.05)).toBe(false)
    expect(sustainReleaseExpired(10, 10.08)).toBe(true)
  })
})
