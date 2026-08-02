import { describe, expect, it } from 'vitest'
import type { ChartNote } from '../../types/game'
import {
  findHandiTapBurstReentry,
  handiTapSustainReleaseExpired,
  isPartialHandiTapChord,
} from './tapInput'

const note = (lanes: ChartNote['lanes']): ChartNote => ({
  tick: 0,
  timeSeconds: 0,
  lanes,
  open: false,
  sustainTicks: 0,
  sustainSeconds: 0,
  hopo: false,
  forced: false,
  tap: false,
})

describe('HandiTap input assistance', () => {
  it('recognizes the first correct thumb of a two-note chord', () => {
    expect(isPartialHandiTapChord(note([0, 4]), [0], [])).toBe(true)
  })

  it('does not treat a completed chord as partial', () => {
    expect(isPartialHandiTapChord(note([1, 3]), [1, 3], [])).toBe(
      false,
    )
  })

  it('rejects a thumb outside the charted chord', () => {
    expect(isPartialHandiTapChord(note([0, 4]), [1], [])).toBe(false)
  })

  it('preserves lanes belonging to an overlapping sustain', () => {
    expect(
      isPartialHandiTapChord(note([0, 2]), [0, 4], [4]),
    ).toBe(true)
  })

  it('allows a longer release grace period for touch sustains', () => {
    expect(handiTapSustainReleaseExpired(1, 1.17)).toBe(false)
    expect(handiTapSustainReleaseExpired(1, 1.181)).toBe(true)
  })

  it('lets a missed generated burst re-enter on a later mini-gem', () => {
    const marker = { timeSeconds: 2, lane: 1 as const, parentNoteIndex: 0 }
    expect(
      findHandiTapBurstReentry(
        [marker],
        ['miss'],
        ['none'],
        [1],
        2.04,
        0.08,
      ),
    ).toEqual(marker)
  })

  it('does not recover authored holds or inactive lanes', () => {
    const marker = { timeSeconds: 2, lane: 1 as const, parentNoteIndex: 0 }
    expect(
      findHandiTapBurstReentry(
        [marker],
        ['hit'],
        ['holding'],
        [1],
        2,
        0.08,
      ),
    ).toBeNull()
    expect(
      findHandiTapBurstReentry(
        [marker],
        ['miss'],
        ['none'],
        [2],
        2,
        0.08,
      ),
    ).toBeNull()
  })
})
