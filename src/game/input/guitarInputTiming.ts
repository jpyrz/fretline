export const HOPO_STRUM_LENIENCY_SECONDS = 0.08
export const STRUM_BEFORE_FRET_LENIENCY_MS = 60

interface HopoStrumLeniencyOptions {
  lastHopoHitTime: number | null
  currentTime: number
  playbackRate: number
}

/**
 * A physical controller may report the fret and strum portions of one gesture
 * in either order. After a HOPO/tap hit, consume one nearly simultaneous
 * strum so it cannot turn a valid hit into an overstrum.
 */
export function isStrumInsideHopoLeniency({
  lastHopoHitTime,
  currentTime,
  playbackRate,
}: HopoStrumLeniencyOptions): boolean {
  if (lastHopoHitTime === null) return false
  const elapsed = currentTime - lastHopoHitTime
  const chartWindow =
    HOPO_STRUM_LENIENCY_SECONDS * Math.max(0.01, playbackRate)
  return elapsed >= 0 && elapsed <= chartWindow
}

export function isPendingStrumActive(
  strumPerformanceTime: number,
  currentPerformanceTime: number,
): boolean {
  const elapsed = currentPerformanceTime - strumPerformanceTime
  return elapsed >= 0 && elapsed <= STRUM_BEFORE_FRET_LENIENCY_MS
}
