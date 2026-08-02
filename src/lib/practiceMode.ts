export const PRACTICE_SPEEDS = [
  1,
  0.9,
  0.8,
  0.7,
  0.6,
  0.5,
  0.4,
  0.3,
  0.25,
] as const

export type PracticeSpeed = (typeof PRACTICE_SPEEDS)[number]

export function normalizePracticeSpeed(value: unknown): PracticeSpeed {
  return (
    PRACTICE_SPEEDS.find((speed) => speed === value) ?? PRACTICE_SPEEDS[0]
  )
}

export function formatPracticeSpeed(speed: PracticeSpeed): string {
  return `${Math.round(speed * 100)}%`
}

export function adjacentPracticeSpeed(
  current: PracticeSpeed,
  direction: -1 | 1,
): PracticeSpeed {
  const index = PRACTICE_SPEEDS.indexOf(current)
  const nextIndex = Math.max(
    0,
    Math.min(PRACTICE_SPEEDS.length - 1, index + direction),
  )
  return PRACTICE_SPEEDS[nextIndex]
}
