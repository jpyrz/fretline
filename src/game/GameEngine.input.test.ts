import { describe, expect, it } from 'vitest'
import type {
  ChartNote,
  KeyboardMapping,
  Lane,
  ParsedChart,
  SessionStats,
} from '../types/game'
import { GameEngine } from './GameEngine'

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

function makeEngine(notes: ChartNote[]) {
  const chart: ParsedChart = {
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
