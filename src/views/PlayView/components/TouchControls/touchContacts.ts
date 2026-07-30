import type { Lane } from '../../../../types/game'

export interface TouchContactSnapshot {
  lanes: Lane[]
  open: boolean
}

export interface PendingTap extends TouchContactSnapshot {
  timestamp: number
}

export class TouchContactTracker {
  private readonly contacts = new Map<number, Lane | null>()
  private pendingLanes = new Set<Lane>()
  private pendingOpen = false
  private pendingTimestamp: number | null = null

  press(pointerId: number, lane: Lane | null, timestamp: number): void {
    this.contacts.set(pointerId, lane)
    if (lane === null) this.pendingOpen = true
    else this.pendingLanes.add(lane)
    this.pendingTimestamp =
      this.pendingTimestamp === null
        ? timestamp
        : Math.min(this.pendingTimestamp, timestamp)
  }

  release(pointerId: number): void {
    this.contacts.delete(pointerId)
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
    const pending = {
      lanes: [...new Set([...heldLanes, ...this.pendingLanes])].sort(
        (a, b) => a - b,
      ),
      open: this.pendingOpen,
      timestamp: this.pendingTimestamp,
    }
    this.pendingLanes.clear()
    this.pendingOpen = false
    this.pendingTimestamp = null
    return pending
  }

  reset(): void {
    this.contacts.clear()
    this.pendingLanes.clear()
    this.pendingOpen = false
    this.pendingTimestamp = null
  }
}
