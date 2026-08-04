import { describe, expect, it } from 'vitest'
import type {
  ChartNote,
  KeyboardMapping,
  Lane,
  ParsedChart,
  SessionStats,
} from '../types/game'
import { GameEngine } from './GameEngine'
import { adaptChartForHandiTap } from './handiTap/handiTap'

const keyboardMapping: KeyboardMapping = {
  frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],
  strumUp: 'ArrowUp',
  strumDown: 'ArrowDown',
  select: 'Enter',
  back: 'Escape',
  pause: 'Enter',
  starPower: 'Space',
  whammy: 'KeyW',
}

function note(
  timeSeconds: number,
  lane: Lane,
  hopo: boolean,
): ChartNote {
  return {
    tick: Math.round(timeSeconds * 480),
    timeSeconds,
    lanes: [lane],
    open: false,
    sustainTicks: 0,
    sustainSeconds: 0,
    hopo,
    forced: hopo,
    tap: false,
  }
}

function testChart(notes: ChartNote[]): ParsedChart {
  return {
    metadata: {
      name: 'Input timing test',
      artist: 'Fretline',
      charter: 'Fretline',
      resolution: 480,
      offsetSeconds: 0,
    },
    notes,
    tempos: [{ tick: 0, bpm: 120, timeSeconds: 0 }],
    trackName: 'ExpertSingle',
    availableTracks: ['ExpertSingle'],
    durationSeconds: 4,
  }
}

function makeEngine(notes: ChartNote[]) {
  const chart = testChart(notes)
  let latestStats: SessionStats | null = null
  const engine = new GameEngine({
    audioContext: {} as AudioContext,
    audioBuffers: [],
    chart,
    calibration: {
      modelVersion: 2,
      audioOffsetMs: 0,
      inputOffsetMs: 0,
      videoOffsetMs: 0,
    },
    controllerMapping: null,
    keyboardMapping,
    inputMode: 'standard',
    onFrame: () => undefined,
    onStats: (stats) => {
      latestStats = stats
    },
    onFinish: () => undefined,
    onPauseChange: () => undefined,
  })
  const input = engine as unknown as {
    keyboardLanes: Set<Lane>
    songTimeAt: (performanceTime: number) => number
    strum: (performanceTime: number) => void
    fretChange: (performanceTime: number) => void
  }
  input.songTimeAt = (performanceTime) => performanceTime / 1_000

  return {
    input,
    stats: () => latestStats,
  }
}

function makeTapEngine(chart: ParsedChart) {
  const engine = new GameEngine({
    audioContext: {} as AudioContext,
    audioBuffers: [],
    chart,
    calibration: {
      modelVersion: 2,
      audioOffsetMs: 0,
      inputOffsetMs: 0,
      videoOffsetMs: 0,
    },
    controllerMapping: null,
    keyboardMapping,
    inputMode: 'tap',
    onFrame: () => undefined,
    onStats: () => undefined,
    onFinish: () => undefined,
    onPauseChange: () => undefined,
  })

  return engine as unknown as {
    touchLanes: Lane[]
    stats: SessionStats
    starPowerPhraseStates: Array<'pending' | 'earned' | 'failed'>
    completeHit: (
      noteIndex: number,
      songTimeSeconds: number,
      scoringTime: number,
      heldLanes: Lane[],
    ) => boolean
    updateSustains: (
      scoringTime: number,
      songTimeSeconds: number,
    ) => void
  }
}

describe('standard guitar input reconciliation', () => {
  it('does not break a HOPO run when its fret arrives just before its strum', () => {
    const { input, stats } = makeEngine([
      note(1, 4, false),
      note(1.1, 3, true),
      note(1.2, 2, true),
    ])

    input.keyboardLanes.add(4)
    input.strum(1_000)

    input.keyboardLanes.delete(4)
    input.keyboardLanes.add(3)
    input.fretChange(1_100)
    input.strum(1_130)

    input.keyboardLanes.delete(3)
    input.keyboardLanes.add(2)
    input.fretChange(1_200)

    expect(stats()).toMatchObject({
      hits: 3,
      overstrums: 0,
      streak: 3,
    })
  })

  it('allows a fret to complete a strum reported slightly earlier', () => {
    const { input, stats } = makeEngine([note(1, 0, false)])

    input.strum(970)
    input.keyboardLanes.add(0)
    input.fretChange(1_000)

    expect(stats()).toMatchObject({
      hits: 1,
      overstrums: 0,
      streak: 1,
    })
  })
})

describe('Timing Lab input capture', () => {
  it('records route delays larger than the normal gameplay hit window', () => {
    let latestStats: SessionStats | null = null
    const engine = new GameEngine({
      audioContext: {} as AudioContext,
      audioBuffers: [],
      chart: testChart([note(1, 0, false)]),
      calibration: {
        modelVersion: 2,
        audioOffsetMs: 0,
        inputOffsetMs: 0,
        videoOffsetMs: 0,
      },
      controllerMapping: null,
      keyboardMapping,
      inputMode: 'tap',
      calibrationMode: true,
      onFrame: () => undefined,
      onStats: (stats) => {
        latestStats = stats
      },
      onFinish: () => undefined,
      onPauseChange: () => undefined,
    })
    const input = engine as unknown as {
      songTimeAt: (performanceTime: number) => number
    }
    input.songTimeAt = (performanceTime) => performanceTime / 1_000

    engine.submitCalibrationHit(1_320)

    expect(latestStats).toMatchObject({
      hits: 1,
      records: [{ result: 'hit' }],
    })
    expect((latestStats as SessionStats | null)?.records[0].errorMs).toBeCloseTo(
      320,
    )
  })
})

describe('HandiTap star-power tremolo holds', () => {
  function starPowerTremoloChart(): ParsedChart {
    const notes = [
      note(2, 1, false),
      note(2.1, 1, false),
      note(2.2, 1, false),
      note(2.3, 1, false),
    ].map((item) => ({
      ...item,
      starPower: true,
      starPowerPhraseIndices: [0],
    }))
    return adaptChartForHandiTap({
      ...testChart(notes),
      starPowerPhrases: [
        {
          tick: notes[0].tick,
          tickLength: notes[3].tick - notes[0].tick,
          timeSeconds: notes[0].timeSeconds,
          endTimeSeconds: notes[3].timeSeconds,
        },
      ],
    })
  }

  it('awards the phrase only after its generated hold completes', () => {
    const input = makeTapEngine(starPowerTremoloChart())
    input.touchLanes = [1]

    expect(input.completeHit(0, 2, 2, [1])).toBe(true)
    expect(input.stats.starPowerMeter).toBe(0)
    expect(input.starPowerPhraseStates).toEqual(['pending'])

    input.updateSustains(2.31, 2.31)
    expect(input.stats.starPowerMeter).toBe(0.25)
    expect(input.starPowerPhraseStates).toEqual(['earned'])
  })

  it('fails the phrase when its generated hold is released early', () => {
    const input = makeTapEngine(starPowerTremoloChart())
    input.touchLanes = [1]
    expect(input.completeHit(0, 2, 2, [1])).toBe(true)

    input.touchLanes = []
    input.updateSustains(2.05, 2.05)
    input.updateSustains(2.24, 2.24)

    expect(input.stats.starPowerMeter).toBe(0)
    expect(input.starPowerPhraseStates).toEqual(['failed'])
  })
})
