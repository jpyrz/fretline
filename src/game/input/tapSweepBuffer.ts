import type { Lane } from '../../types/game'

export const HANDITAP_SWEEP_MEMORY_SECONDS = 0.18

interface SweepCrossing {
  lane: Lane
  scoringTime: number
}

/**
 * Remembers the ordered lane path of each active thumb. This lets a rapid
 * swipe cross a lane slightly before its note enters the hit window without
 * turning the gesture into autoplay: the correct lane still has to appear in
 * the recorded path, in order, while that pointer remains down.
 */
export class TapSweepBuffer {
  private readonly crossingsByPointer = new Map<number, SweepCrossing[]>()

  record(pointerId: number, lane: Lane, scoringTime: number): void {
    this.prune(scoringTime)
    const crossings = this.crossingsByPointer.get(pointerId) ?? []
    if (crossings[crossings.length - 1]?.lane === lane) return
    crossings.push({ lane, scoringTime })
    this.crossingsByPointer.set(pointerId, crossings)
  }

  has(lane: Lane, scoringTime: number): boolean {
    this.prune(scoringTime)
    return [...this.crossingsByPointer.values()].some((crossings) =>
      crossings.some((crossing) => crossing.lane === lane),
    )
  }

  consume(lane: Lane, scoringTime: number): boolean {
    this.prune(scoringTime)
    let selectedPointer: number | null = null
    let selectedIndex = -1
    let selectedTime = Number.POSITIVE_INFINITY

    for (const [pointerId, crossings] of this.crossingsByPointer) {
      const index = crossings.findIndex((crossing) => crossing.lane === lane)
      if (index < 0 || crossings[index].scoringTime >= selectedTime) continue
      selectedPointer = pointerId
      selectedIndex = index
      selectedTime = crossings[index].scoringTime
    }

    if (selectedPointer === null) return false
    const crossings = this.crossingsByPointer.get(selectedPointer)
    if (!crossings) return false
    crossings.splice(0, selectedIndex + 1)
    if (crossings.length === 0) {
      this.crossingsByPointer.delete(selectedPointer)
    }
    return true
  }

  release(pointerId: number): void {
    this.crossingsByPointer.delete(pointerId)
  }

  reset(): void {
    this.crossingsByPointer.clear()
  }

  private prune(scoringTime: number): void {
    const cutoff = scoringTime - HANDITAP_SWEEP_MEMORY_SECONDS
    for (const [pointerId, crossings] of this.crossingsByPointer) {
      const firstCurrent = crossings.findIndex(
        (crossing) => crossing.scoringTime >= cutoff,
      )
      if (firstCurrent < 0) {
        this.crossingsByPointer.delete(pointerId)
      } else if (firstCurrent > 0) {
        crossings.splice(0, firstCurrent)
      }
    }
  }
}
