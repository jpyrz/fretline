const WHAMMY_DEAD_ZONE_PX = 10

interface WhammyContact {
  originY: number
  amount: number
}

export function whammyAmountForDrag(
  originY: number,
  currentY: number,
  dragDistance: number,
): number {
  const usableDistance = Math.max(1, dragDistance - WHAMMY_DEAD_ZONE_PX)
  const upwardDistance = originY - currentY - WHAMMY_DEAD_ZONE_PX
  return Math.max(0, Math.min(1, upwardDistance / usableDistance))
}

export class TouchWhammyTracker {
  private readonly contacts = new Map<number, WhammyContact>()

  press(pointerId: number, originY: number): void {
    this.contacts.set(pointerId, { originY, amount: 0 })
  }

  move(
    pointerId: number,
    currentY: number,
    dragDistance: number,
  ): number | null {
    const contact = this.contacts.get(pointerId)
    if (!contact) return null

    contact.amount = whammyAmountForDrag(
      contact.originY,
      currentY,
      dragDistance,
    )
    return this.amount()
  }

  release(pointerId: number): number {
    this.contacts.delete(pointerId)
    return this.amount()
  }

  amount(): number {
    return Math.max(
      0,
      ...[...this.contacts.values()].map((contact) => contact.amount),
    )
  }

  reset(): void {
    this.contacts.clear()
  }
}
