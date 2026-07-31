import { describe, expect, it } from 'vitest'
import type { ChartNote } from '../../types/game'
import { isTapSweepTransition } from './tapSweepPath'

function note(
  lane: ChartNote['lanes'][number],
  overrides: Partial<ChartNote> = {},
): ChartNote {
  return {
    tick: 0,
    timeSeconds: 0,
    lanes: [lane],
    open: false,
    sustainTicks: 0,
    sustainSeconds: 0,
    hopo: false,
    forced: false,
    tap: false,
    ...overrides,
  }
}

describe('Tap Mode sweep paths', () => {
  it('connects a different-lane HOPO or tap destination', () => {
    expect(
      isTapSweepTransition(
        note(0),
        note(1, { hopo: true }),
        'pending',
        'pending',
      ),
    ).toBe(true)
    expect(
      isTapSweepTransition(
        note(1),
        note(4, { tap: true }),
        'hit',
        'pending',
      ),
    ).toBe(true)
  })

  it('does not imply that repeated lanes, chords, or opens can be swept', () => {
    expect(
      isTapSweepTransition(
        note(2),
        note(2, { tap: true }),
        'pending',
        'pending',
      ),
    ).toBe(false)
    expect(
      isTapSweepTransition(
        note(0),
        note(1, { lanes: [1, 2], hopo: true }),
        'pending',
        'pending',
      ),
    ).toBe(false)
    expect(
      isTapSweepTransition(
        note(0),
        note(1, { open: true, lanes: [], tap: true }),
        'pending',
        'pending',
      ),
    ).toBe(false)
  })

  it('stops the path after a miss and before leaving a sustain', () => {
    expect(
      isTapSweepTransition(
        note(0),
        note(1, { hopo: true }),
        'miss',
        'pending',
      ),
    ).toBe(false)
    expect(
      isTapSweepTransition(
        note(0, { sustainSeconds: 0.5 }),
        note(1, { hopo: true }),
        'hit',
        'pending',
      ),
    ).toBe(false)
  })
})
