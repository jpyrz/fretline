import type { ChartNote, Lane } from '../types/game'

export const HIT_WINDOW_MS = 120
export const CALIBRATION_HIT_WINDOW_MS = 400
export const SUSTAIN_POINTS_PER_BEAT = 25
export const SUSTAIN_RELEASE_GRACE_SECONDS = 0.075

export function canFretHit(
  note: ChartNote,
  previousNoteHit: boolean,
): boolean {
  return note.tap || (note.hopo && previousNoteHit)
}

export function lanesMatch(note: ChartNote, heldLanes: Lane[]): boolean {
  if (note.open) return heldLanes.length === 0
  if (note.lanes.length === 1) {
    const targetLane = note.lanes[0]
    return (
      heldLanes.includes(targetLane) &&
      heldLanes.every((lane) => lane <= targetLane)
    )
  }
  if (note.lanes.length !== heldLanes.length) return false
  return note.lanes.every((lane) => heldLanes.includes(lane))
}

export function sustainLanesHeld(
  note: ChartNote,
  heldLanes: Lane[],
): boolean {
  if (note.open) return heldLanes.length === 0
  return note.lanes.every((lane) => heldLanes.includes(lane))
}

export function lanesMatchWithActiveSustains(
  note: ChartNote,
  heldLanes: Lane[],
  activeSustainLanes: Lane[],
): boolean {
  if (note.open) return lanesMatch(note, heldLanes)

  const relevantHeldLanes = heldLanes.filter(
    (lane) =>
      note.lanes.includes(lane) || !activeSustainLanes.includes(lane),
  )
  return lanesMatch(note, relevantHeldLanes)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function multiplierForStreak(streak: number): number {
  return Math.min(4, Math.floor(streak / 10) + 1)
}

export function scoreMultiplier(
  streak: number,
  starPowerActive = false,
): number {
  return multiplierForStreak(streak) * (starPowerActive ? 2 : 1)
}

export function scoreForHit(
  laneCount: number,
  streakBeforeHit: number,
  starPowerActive = false,
): number {
  return (
    50 *
    Math.max(1, laneCount) *
    scoreMultiplier(streakBeforeHit, starPowerActive)
  )
}

export function sustainBasePointsAtTick(
  note: ChartNote,
  currentTick: number,
  resolution: number,
): number {
  if (note.sustainTicks <= 0 || resolution <= 0) return 0
  const elapsedTicks = Math.max(
    0,
    Math.min(note.sustainTicks, currentTick - note.tick),
  )
  return Math.floor(
    (elapsedTicks / resolution) * SUSTAIN_POINTS_PER_BEAT + 0.000001,
  )
}

export function sustainReleaseExpired(
  mismatchStartedAt: number | null,
  currentTime: number,
): boolean {
  return (
    mismatchStartedAt !== null &&
    currentTime - mismatchStartedAt >= SUSTAIN_RELEASE_GRACE_SECONDS
  )
}
