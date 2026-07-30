import { describe, expect, it } from 'vitest'
import type { SessionStats } from '../../types/game'
import { calculateSessionResults } from './sessionResults'

function stats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    score: 0,
    sustainPoints: 0,
    streak: 0,
    bestStreak: 0,
    hits: 0,
    misses: 0,
    overstrums: 0,
    sustainsCompleted: 0,
    sustainsBroken: 0,
    starPowerMeter: 0,
    starPowerActive: false,
    starPowerPhrasesHit: 0,
    starPowerPhrasesMissed: 0,
    starPowerActivations: 0,
    lastErrorMs: null,
    records: [],
    ...overrides,
  }
}

describe('session results', () => {
  it('calculates rank, combo, progress, and multiplier consistently', () => {
    const result = calculateSessionResults(
      stats({
        hits: 99,
        misses: 1,
        streak: 35,
        starPowerActive: true,
      }),
      100,
    )

    expect(result.noteAccuracy).toBe(99)
    expect(result.resultRank).toBe('S')
    expect(result.fullCombo).toBe(false)
    expect(result.chartProgress).toBe(100)
    expect(result.multiplier).toBe(8)
  })

  it('excludes calibration warmup hits only from the correction', () => {
    const result = calculateSessionResults(
      stats({
        records: [
          { noteIndex: 0, result: 'hit', errorMs: 100 },
          { noteIndex: 1, result: 'hit', errorMs: 20 },
          { noteIndex: 2, result: 'hit', errorMs: -10 },
        ],
      }),
      3,
      1,
    )

    expect(result.suggestedCorrection).toBe(5)
    expect(result.timingMedian).toBe(20)
    expect(result.earlyHits).toBe(1)
    expect(result.lateHits).toBe(2)
  })
})
