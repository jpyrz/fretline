import { describe, expect, it } from 'vitest'
import type { ChartNote, Lane, ParsedChart } from '../../types/game'
import { adaptChartForHandiTap, HANDITAP_VERSION } from './handiTap'

function note(
  timeSeconds: number,
  lanes: Lane[],
  overrides: Partial<ChartNote> = {},
): ChartNote {
  return {
    tick: Math.round(timeSeconds * 960),
    timeSeconds,
    lanes,
    open: false,
    sustainTicks: 0,
    sustainSeconds: 0,
    hopo: false,
    forced: false,
    tap: false,
    ...overrides,
  }
}

function chart(notes: ChartNote[]): ParsedChart {
  return {
    metadata: {
      name: 'HandiTap test',
      artist: 'Fretline',
      charter: 'Tests',
      resolution: 480,
      offsetSeconds: 0,
    },
    notes,
    tempos: [{ tick: 0, bpm: 120, timeSeconds: 0 }],
    trackName: 'ExpertSingle',
    availableTracks: ['ExpertSingle'],
    durationSeconds: 10,
    starPowerPhrases: [],
  }
}

describe('HandiTap chart adaptation', () => {
  it('has an explicit cache version', () => {
    expect(HANDITAP_VERSION).toBe(5)
  })

  it('caps chords at two reachable outer lanes', () => {
    const source = chart([
      note(1, [0, 2, 4]),
      note(2, [0, 1, 2, 3]),
    ])

    const adapted = adaptChartForHandiTap(source)

    expect(adapted.notes.map((item) => item.lanes)).toEqual([
      [0, 4],
      [0, 3],
    ])
    expect(source.notes[0].lanes).toEqual([0, 2, 4])
  })

  it('preserves ordinary notes, timing, sustains, and authored flags', () => {
    const sourceNote = note(1, [2], {
      sustainTicks: 480,
      sustainSeconds: 0.5,
      hopo: true,
      starPower: true,
      starPowerPhraseIndices: [0],
    })

    const adapted = adaptChartForHandiTap(chart([sourceNote]))

    expect(adapted.notes).toEqual([sourceNote])
  })

  it('only reduces extreme bursts and prefers musical accents', () => {
    const source = chart([
      note(1, [0]),
      note(1.05, [1], { sustainTicks: 240, sustainSeconds: 0.25 }),
      note(1.1, [2]),
      note(1.2, [3]),
    ])

    const adapted = adaptChartForHandiTap(source)

    expect(adapted.notes.map((item) => item.timeSeconds)).toEqual([
      1.05,
      1.2,
    ])
  })

  it('turns rapid repeated two-thumb chords into a hold', () => {
    const source = chart([
      note(2, [0, 4]),
      note(2.1, [0, 4]),
      note(2.2, [0, 4]),
    ])

    const adapted = adaptChartForHandiTap(source)

    expect(adapted.notes).toHaveLength(1)
    expect(adapted.notes[0]).toMatchObject({
      lanes: [0, 4],
      sustainTicks: 192,
    })
    expect(adapted.notes[0].sustainSeconds).toBeCloseTo(0.2)
  })

  it('preserves playable repeated chords regardless of authored note tails', () => {
    const source = chart([
      note(2, [0, 4], { sustainTicks: 77, sustainSeconds: 0.08 }),
      note(2.18, [0, 4], {
        sustainTicks: 77,
        sustainSeconds: 0.08,
      }),
      note(2.36, [0, 4], {
        sustainTicks: 77,
        sustainSeconds: 0.08,
      }),
    ])

    expect(adaptChartForHandiTap(source).notes).toEqual(source.notes)
  })

  it('preserves a two-chord accent even when its attacks are rapid', () => {
    const source = chart([
      note(2, [1, 3]),
      note(2.08, [1, 3]),
    ])

    expect(adaptChartForHandiTap(source).notes).toEqual(source.notes)
  })

  it('turns only very rapid four-note tremolo runs into a marked hold', () => {
    const source = chart([
      note(3, [2]),
      note(3.1, [2]),
      note(3.2, [2]),
      note(3.3, [2]),
    ])

    const adapted = adaptChartForHandiTap(source)

    expect(adapted.notes).toHaveLength(1)
    expect(adapted.notes[0]).toMatchObject({
      lanes: [2],
      sustainTicks: 288,
    })
    expect(adapted.notes[0].sustainSeconds).toBeCloseTo(0.3)
    expect(adapted.handiTapBurstMarkers).toEqual([
      { timeSeconds: 3.1, lane: 2, parentNoteIndex: 0 },
      { timeSeconds: 3.2, lane: 2, parentNoteIndex: 0 },
      { timeSeconds: 3.3, lane: 2, parentNoteIndex: 0 },
    ])
  })

  it('preserves ordinary double taps and lane-changing runs', () => {
    const source = chart([
      note(3, [2]),
      note(3.12, [2]),
      note(3.24, [2]),
      note(4, [2]),
      note(4.1, [2]),
      note(4.2, [3]),
    ])

    expect(adaptChartForHandiTap(source).notes).toHaveLength(6)
  })

  it('does not merge star-power chord repetitions', () => {
    const source = chart([
      note(2, [0, 4], { starPower: true, starPowerPhraseIndices: [0] }),
      note(2.1, [0, 4], { starPower: true, starPowerPhraseIndices: [0] }),
    ])

    expect(adaptChartForHandiTap(source).notes).toHaveLength(2)
  })

  it('does not merge star-power tremolo repetitions', () => {
    const source = chart([
      note(2, [1], { starPower: true, starPowerPhraseIndices: [0] }),
      note(2.1, [1], { starPower: true, starPowerPhraseIndices: [0] }),
      note(2.2, [1], { starPower: true, starPowerPhraseIndices: [0] }),
    ])

    expect(adaptChartForHandiTap(source).notes).toHaveLength(3)
  })

  it('folds rapid full-fretboard leads into three thumb-friendly lanes', () => {
    const source = chart([
      note(1, [0]),
      note(1.12, [1], { hopo: true }),
      note(1.24, [2], { hopo: true }),
      note(1.36, [3], { hopo: true }),
      note(1.48, [4], { hopo: true }),
      note(1.6, [0], { tap: true }),
    ])

    const adapted = adaptChartForHandiTap(source)

    expect(adapted.notes.map((item) => item.lanes[0])).toEqual([
      1, 2, 3, 2, 3, 2,
    ])
    expect(adapted.notes.map((item) => item.timeSeconds)).toEqual(
      source.notes.map((item) => item.timeSeconds),
    )
  })

  it('preserves slower and narrower lead phrases', () => {
    const slower = chart([
      note(1, [0]),
      note(1.2, [1], { hopo: true }),
      note(1.4, [2], { hopo: true }),
      note(1.6, [3], { hopo: true }),
      note(1.8, [4], { hopo: true }),
    ])
    const narrower = chart([
      note(2, [0]),
      note(2.1, [1], { hopo: true }),
      note(2.2, [2], { hopo: true }),
      note(2.3, [3], { hopo: true }),
      note(2.4, [2], { hopo: true }),
    ])

    expect(adaptChartForHandiTap(slower).notes).toEqual(slower.notes)
    expect(adaptChartForHandiTap(narrower).notes).toEqual(narrower.notes)
  })

  it('is deterministic and does not mutate the imported chart', () => {
    const source = chart([
      note(1, [0, 2, 4]),
      note(1.04, [1]),
      note(2, [3]),
    ])
    const snapshot = structuredClone(source)

    expect(adaptChartForHandiTap(source)).toEqual(
      adaptChartForHandiTap(source),
    )
    expect(source).toEqual(snapshot)
  })
})
