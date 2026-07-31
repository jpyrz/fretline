export interface GesturePoint {
  x: number
  y: number
}

export interface DirectionVector {
  x: number
  y: number
}

export function projectPowerSwipe(
  start: GesturePoint,
  current: GesturePoint,
  upwardDirection: DirectionVector,
): number {
  return (
    (current.x - start.x) * upwardDirection.x +
    (current.y - start.y) * upwardDirection.y
  )
}

export function gestureDistance(
  start: GesturePoint,
  current: GesturePoint,
): number {
  return Math.hypot(current.x - start.x, current.y - start.y)
}

export function isPowerSwipe(
  start: GesturePoint,
  current: GesturePoint,
  upwardDirection: DirectionVector,
  threshold: number,
): boolean {
  return (
    projectPowerSwipe(start, current, upwardDirection) >= threshold
  )
}
