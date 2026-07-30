import type { ChartNote, Lane } from '../../types/game'

export function tapAssistedHeldLanes(
  note: ChartNote,
  heldLanes: Lane[],
  activeSustainLanes: Lane[],
): Lane[] | null {
  if (note.open || note.lanes.length < 3) return null

  const activeSustains = new Set(activeSustainLanes)
  const intentionalLanes = heldLanes.filter(
    (lane) => !activeSustains.has(lane),
  )

  if (
    intentionalLanes.length === 0 ||
    intentionalLanes.some((lane) => !note.lanes.includes(lane))
  ) {
    return null
  }

  return [
    ...new Set([...activeSustainLanes, ...note.lanes]),
  ].sort((a, b) => a - b)
}
