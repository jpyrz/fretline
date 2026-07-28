import { describe, expect, it } from 'vitest'
import type { ChartNote } from '../types/game'
import {
  canFretHit,
  lanesMatch,
  lanesMatchWithActiveSustains,
  median,
  scoreForHit,
  sustainLanesHeld,
} from './scoring'

const note: ChartNote = {
  tick: 0,
  timeSeconds: 0,
  lanes: [0, 2],
  open: false,
  sustainTicks: 0,
  sustainSeconds: 0,
  hopo: false,
  forced: false,
  tap: false,
}

describe('scoring helpers', () => {
  it('requires an exact chord match', () => {
    expect(lanesMatch(note, [0, 2])).toBe(true)
    expect(lanesMatch(note, [0])).toBe(false)
    expect(lanesMatch(note, [0, 1, 2])).toBe(false)
  })

  it('allows lower frets under a single note but rejects higher frets', () => {
    const single: ChartNote = { ...note, lanes: [2] }
    expect(lanesMatch(single, [0, 1, 2])).toBe(true)
    expect(lanesMatch(single, [2, 3])).toBe(false)
  })

  it('keeps staggered sustains alive as new frets join the held shape', () => {
    const greenSustain: ChartNote = {
      ...note,
      lanes: [0],
      sustainTicks: 384,
      sustainSeconds: 1,
    }
    const chordSustain: ChartNote = {
      ...greenSustain,
      lanes: [0, 2],
    }

    expect(sustainLanesHeld(greenSustain, [0, 1, 2])).toBe(true)
    expect(sustainLanesHeld(chordSustain, [0, 1, 2, 4])).toBe(true)
    expect(sustainLanesHeld(chordSustain, [0, 1, 4])).toBe(false)
  })

  it('ignores active sustain frets when matching the next staggered note', () => {
    const blue: ChartNote = { ...note, lanes: [3] }
    const yellow: ChartNote = { ...note, lanes: [2] }
    expect(lanesMatch(blue, [3, 4])).toBe(false)
    expect(lanesMatchWithActiveSustains(blue, [3, 4], [4])).toBe(true)
    expect(lanesMatchWithActiveSustains(yellow, [2, 3, 4], [4])).toBe(
      false,
    )
  })

  it('calculates medians and streak multipliers', () => {
    expect(median([22, -8, 10, 14])).toBe(12)
    expect(scoreForHit(1, 0)).toBe(50)
    expect(scoreForHit(2, 30)).toBe(400)
  })

  it('requires a live chain for HOPOs but not tap notes', () => {
    expect(canFretHit({ ...note, hopo: true }, false)).toBe(false)
    expect(canFretHit({ ...note, hopo: true }, true)).toBe(true)
    expect(canFretHit({ ...note, tap: true }, false)).toBe(true)
  })
})
