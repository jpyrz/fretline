import type {
  ChartNote,
  HandiTapBurstMarker,
  Lane,
  SustainState,
} from '../../types/game'

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

export function findHandiTapBurstReentry(
  markers: readonly HandiTapBurstMarker[],
  noteStates: ReadonlyArray<'pending' | 'hit' | 'miss'>,
  sustainStates: readonly SustainState[],
  heldLanes: readonly Lane[],
  scoringTime: number,
  hitWindowSeconds: number,
): HandiTapBurstMarker | null {
  let closest: HandiTapBurstMarker | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const marker of markers) {
    const distance = Math.abs(marker.timeSeconds - scoringTime)
    if (distance > hitWindowSeconds || distance >= closestDistance) continue
    if (!heldLanes.includes(marker.lane)) continue
    const noteState = noteStates[marker.parentNoteIndex]
    const sustainState = sustainStates[marker.parentNoteIndex]
    if (noteState !== 'miss' && sustainState !== 'released') continue
    closest = marker
    closestDistance = distance
  }

  return closest
}
