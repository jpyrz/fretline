import { median } from '../../lib/scoring'
import type { SessionStats } from '../../types/game'

export type RunSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'guest'
  | 'practice'
  | 'error'

export interface SessionResults {
  suggestedCorrection: number | null
  timingMedian: number | null
  meanAbsoluteError: number | null
  earlyHits: number
  lateHits: number
  noteAccuracy: number
  resultRank: 'S' | 'A' | 'B' | 'C' | 'D'
  fullCombo: boolean
  chartProgress: number
  multiplier: number
}

export function calculateSessionResults(
  stats: SessionStats,
  noteCount: number,
  calibrationWarmupHits = 0,
): SessionResults {
  const allHitErrors = stats.records
    .filter((record) => record.result === 'hit')
    .map((record) => record.errorMs)
  const correctionErrors = allHitErrors.slice(calibrationWarmupHits)
  const timingMedian = median(allHitErrors)
  const meanAbsoluteError =
    allHitErrors.length > 0
      ? allHitErrors.reduce(
          (total, errorMs) => total + Math.abs(errorMs),
          0,
        ) / allHitErrors.length
      : null
  const earlyHits = allHitErrors.filter((errorMs) => errorMs < -8).length
  const lateHits = allHitErrors.filter((errorMs) => errorMs > 8).length
  const noteAccuracy = noteCount > 0 ? (stats.hits / noteCount) * 100 : 0
  const resultRank =
    noteAccuracy >= 99
      ? 'S'
      : noteAccuracy >= 95
        ? 'A'
        : noteAccuracy >= 88
          ? 'B'
          : noteAccuracy >= 75
            ? 'C'
            : 'D'

  return {
    suggestedCorrection: median(correctionErrors),
    timingMedian,
    meanAbsoluteError,
    earlyHits,
    lateHits,
    noteAccuracy,
    resultRank,
    fullCombo:
      stats.hits === noteCount &&
      stats.misses === 0 &&
      stats.overstrums === 0 &&
      stats.sustainsBroken === 0,
    chartProgress:
      noteCount > 0
        ? Math.min(100, ((stats.hits + stats.misses) / noteCount) * 100)
        : 0,
    multiplier:
      Math.min(4, Math.floor(stats.streak / 10) + 1) *
      (stats.starPowerActive ? 2 : 1),
  }
}
