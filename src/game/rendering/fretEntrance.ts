import type { Lane } from '../../types/game'
import { COUNTDOWN_SECONDS } from '../playbackTimeline'

const LANE_STAGGER_SECONDS = 0.075
const DROP_DURATION_SECONDS = 0.42

export interface FretEntranceTransform {
  opacity: number
  offsetScale: number
  sizeScale: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function easeOutBack(progress: number): number {
  const overshoot = 1.45
  const shifted = progress - 1
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2
}

export function fretEntranceProgress(
  songTimeSeconds: number,
  lane: Lane,
): number {
  const elapsed = songTimeSeconds + COUNTDOWN_SECONDS
  return clamp(
    (elapsed - lane * LANE_STAGGER_SECONDS) / DROP_DURATION_SECONDS,
    0,
    1,
  )
}

export function fretEntranceTransform(
  songTimeSeconds: number,
  lane: Lane,
): FretEntranceTransform {
  const progress = fretEntranceProgress(songTimeSeconds, lane)
  if (progress === 0) {
    return { opacity: 0, offsetScale: -4.8, sizeScale: 0.74 }
  }
  if (progress === 1) {
    return { opacity: 1, offsetScale: 0, sizeScale: 1 }
  }
  const eased = easeOutBack(progress)

  return {
    opacity: clamp(progress / 0.24, 0, 1),
    offsetScale: -4.8 * (1 - eased),
    sizeScale: 0.74 + eased * 0.26,
  }
}
