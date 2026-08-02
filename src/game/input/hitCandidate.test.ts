import { describe, expect, it } from 'vitest'
import type { ChartNote, Lane } from '../../types/game'
import { lanesMatch } from '../../lib/scoring'
import { closestHitCandidate } from './hitCandidate'

function note(timeSeconds: number, lane: Lane): ChartNote {
  return {
    tick: 0,
    timeSeconds,
    lanes: [lane],
    open: false,
    sustainTicks: 0,
    sustainSeconds: 0,
    hopo: true,
    forced: true,
    tap: false,
  }
}

describe('closest hit candidate', () => {
  it('skips a closer wrong-lane note during dense HOPO recovery', () => {
    const notes = [note(10, 2), note(10.114, 4)]
    const heldLanes: Lane[] = [4]

    expect(
      closestHitCandidate({
        notes,
        noteStates: ['pending', 'pending'],
        startIndex: 0,
        scoringTime: 10.055,
        windowSeconds: 0.12,
        isEligible: (candidate) => lanesMatch(candidate, heldLanes),
      }),
    ).toBe(1)
  })

  it('still chooses the closest note when multiple notes match', () => {
    const notes = [note(10, 2), note(10.114, 2)]

    expect(
      closestHitCandidate({
        notes,
        noteStates: ['pending', 'pending'],
        startIndex: 0,
        scoringTime: 10.08,
        windowSeconds: 0.12,
        isEligible: () => true,
      }),
    ).toBe(1)
  })
})
