import { describe, expect, it } from 'vitest'
import type { ChartNote } from '../../types/game'
import { tapAssistedHeldLanes } from './tapInput'

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

describe('tap chord assistance', () => {
  it('lets one thumb represent an original three-note chord', () => {
    expect(tapAssistedHeldLanes(note([0, 2, 4]), [2], [])).toEqual([
      0, 2, 4,
    ])
  })

  it('does not simplify two-note chords', () => {
    expect(tapAssistedHeldLanes(note([1, 3]), [1], [])).toBeNull()
  })

  it('rejects a thumb outside the charted chord', () => {
    expect(tapAssistedHeldLanes(note([0, 2, 4]), [1], [])).toBeNull()
  })

  it('preserves lanes belonging to an overlapping sustain', () => {
    expect(
      tapAssistedHeldLanes(note([0, 1, 2]), [1, 4], [4]),
    ).toEqual([0, 1, 2, 4])
  })
})
