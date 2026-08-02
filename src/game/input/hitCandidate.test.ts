import { describe, expect, it } from 'vitest'
import type { ChartNote, Lane } from '../../types/game'
import { lanesMatch } from '../../lib/scoring'
import {
  closestHitCandidate,
  frontendHopoCandidate,
} from './hitCandidate'

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

describe('front-end HOPO candidate', () => {
  it('buffers a matching transition for the next HOPO in a live chain', () => {
    const notes = [note(10, 2), note(10.114, 1)]

    expect(
      frontendHopoCandidate({
        notes,
        noteStates: ['hit', 'pending'],
        startIndex: 1,
        lastHitNoteIndex: 0,
        heldLanes: [1],
        activeSustainLanes: [],
      }),
    ).toBe(1)
  })

  it('does not buffer a HOPO after the combo chain is broken', () => {
    const notes = [note(10, 2), note(10.114, 1)]

    expect(
      frontendHopoCandidate({
        notes,
        noteStates: ['miss', 'pending'],
        startIndex: 1,
        lastHitNoteIndex: null,
        heldLanes: [1],
        activeSustainLanes: [],
      }),
    ).toBe(-1)
  })

  it('does not skip over the immediate next pending note', () => {
    const notes = [note(10, 2), note(10.114, 1), note(10.228, 0)]

    expect(
      frontendHopoCandidate({
        notes,
        noteStates: ['hit', 'pending', 'pending'],
        startIndex: 1,
        lastHitNoteIndex: 0,
        heldLanes: [0],
        activeSustainLanes: [],
      }),
    ).toBe(-1)
  })
})
