import type { Lane } from '../../../../types/game'

export interface TouchContactSnapshot {
  lanes: Lane[]
  open: boolean
}

export interface PendingTap extends TouchContactSnapshot {
  timestamp: number
}

export function lanesCrossedBetween(from: Lane, to: Lane): Lane[] {
  if (from === to) return []
  const direction = from < to ? 1 : -1
  const crossed: Lane[] = []
  for (
    let lane = from + direction;
    direction > 0 ? lane <= to : lane >= to;
    lane += direction
  ) {
    crossed.push(lane as Lane)
  }
  return crossed
}

export class TouchContactTracker {
  private readonly contacts = new Map<number, Lane | null>()
  private readonly pendingContacts = new Map<number, Lane | null>()
  private pendingTimestamp: number | null = null

  press(pointerId: number, lane: Lane | null, timestamp: number): void {
    this.contacts.set(pointerId, lane)
    this.pendingContacts.set(pointerId, lane)
    this.pendingTimestamp =
      this.pendingTimestamp === null
        ? timestamp
        : Math.min(this.pendingTimestamp, timestamp)
  }

  move(
    pointerId: number,
    lane: Lane,
  ): 'pending' | 'held' | null {
    if (
      !this.contacts.has(pointerId) ||
      this.contacts.get(pointerId) === lane
    ) {
      return null
    }

    this.contacts.set(pointerId, lane)
    if (this.pendingContacts.has(pointerId)) {
      this.pendingContacts.set(pointerId, lane)
      return 'pending'
    }
    return 'held'
  }

  release(pointerId: number): 'pending' | 'held' | null {
    if (!this.contacts.has(pointerId)) return null
    const releaseType = this.pendingContacts.has(pointerId)
      ? 'pending'
      : 'held'
    this.contacts.delete(pointerId)
    return releaseType
  }

  contact(pointerId: number): Lane | null | undefined {
    return this.contacts.get(pointerId)
  }

  snapshot(): TouchContactSnapshot {
    const lanes = [...this.contacts.values()]
      .filter((lane): lane is Lane => lane !== null)
      .filter((lane, index, values) => values.indexOf(lane) === index)
      .sort((a, b) => a - b)
    return {
      lanes,
      open: [...this.contacts.values()].includes(null),
    }
  }

  consumePendingTap(): PendingTap | null {
    if (this.pendingTimestamp === null) return null
    const heldLanes = this.snapshot().lanes
    const pendingValues = [...this.pendingContacts.values()]
    const pendingLanes = pendingValues.filter(
      (lane): lane is Lane => lane !== null,
    )
    const pending = {
      lanes: [...new Set([...heldLanes, ...pendingLanes])].sort(
        (a, b) => a - b,
      ),
      open: pendingValues.includes(null),
      timestamp: this.pendingTimestamp,
    }
    this.pendingContacts.clear()
    this.pendingTimestamp = null
    return pending
  }

  reset(): void {
    this.contacts.clear()
    this.pendingContacts.clear()
    this.pendingTimestamp = null
  }
}
