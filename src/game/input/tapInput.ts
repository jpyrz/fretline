import type { ChartNote, Lane } from '../../types/game'

export const HANDITAP_SUSTAIN_RELEASE_GRACE_SECONDS = 0.18

export function isPartialHandiTapChord(
  note: ChartNote,
  heldLanes: Lane[],
  activeSustainLanes: Lane[],
): boolean {
  if (note.open || note.lanes.length !== 2) return false

  const relevantHeldLanes = heldLanes.filter(
    (lane) =>
      note.lanes.includes(lane) || !activeSustainLanes.includes(lane),
  )

  return (
    relevantHeldLanes.length === 1 &&
    note.lanes.includes(relevantHeldLanes[0])
  )
}

export function handiTapSustainReleaseExpired(
  mismatchStartedAt: number | null,
  currentTime: number,
): boolean {
  return (
    mismatchStartedAt !== null &&
    currentTime - mismatchStartedAt >=
      HANDITAP_SUSTAIN_RELEASE_GRACE_SECONDS
  )
}
