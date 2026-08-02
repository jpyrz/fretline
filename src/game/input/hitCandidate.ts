import type { ChartNote } from '../../types/game'

export type NoteJudgementState = 'pending' | 'hit' | 'miss'

interface ClosestHitCandidateOptions {
  notes: readonly ChartNote[]
  noteStates: readonly NoteJudgementState[]
  startIndex: number
  scoringTime: number
  windowSeconds: number
  isEligible: (note: ChartNote, noteIndex: number) => boolean
}

/**
 * Select the closest playable note, not merely the closest pending note.
 * Dense charts can place two different lanes inside the same hit window.
 */
export function closestHitCandidate({
  notes,
  noteStates,
  startIndex,
  scoringTime,
  windowSeconds,
  isEligible,
}: ClosestHitCandidateOptions): number {
  let candidateIndex = -1
  let candidateDistance = Number.POSITIVE_INFINITY

  for (let index = startIndex; index < notes.length; index += 1) {
    if (noteStates[index] !== 'pending') continue
    const note = notes[index]
    if (note.timeSeconds > scoringTime + windowSeconds) break
    if (!isEligible(note, index)) continue

    const distance = Math.abs(scoringTime - note.timeSeconds)
    if (distance <= windowSeconds && distance < candidateDistance) {
      candidateIndex = index
      candidateDistance = distance
    }
  }

  return candidateIndex
}
