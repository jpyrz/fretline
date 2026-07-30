import type { ChartNote, SustainState } from '../types/game'

export const STAR_POWER_PER_PHRASE = 0.25
export const STAR_POWER_ACTIVATION_THRESHOLD = 0.5
export const STAR_POWER_FULL_BAR_MEASURES = 8
export const BEATS_PER_MEASURE = 4
export const STAR_POWER_WHAMMY_FULL_BAR_BEATS = 30

export function canActivateStarPower(
  meter: number,
  active: boolean,
): boolean {
  return !active && meter >= STAR_POWER_ACTIVATION_THRESHOLD
}

export function addStarPowerPhrase(meter: number): number {
  return Math.min(1, meter + STAR_POWER_PER_PHRASE)
}

export function drainStarPower(
  meter: number,
  tickDelta: number,
  resolution: number,
): number {
  if (tickDelta <= 0 || resolution <= 0) return meter
  const fullBarTicks =
    resolution * BEATS_PER_MEASURE * STAR_POWER_FULL_BAR_MEASURES
  return Math.max(0, meter - tickDelta / fullBarTicks)
}

export function addWhammyStarPower(
  meter: number,
  tickDelta: number,
  resolution: number,
  active: boolean,
): number {
  if (!active || tickDelta <= 0 || resolution <= 0) return meter
  const fullBarTicks = resolution * STAR_POWER_WHAMMY_FULL_BAR_BEATS
  return Math.min(1, meter + tickDelta / fullBarTicks)
}

export function isWhammyStarPowerSustain(
  note: Pick<ChartNote, 'starPower' | 'timeSeconds' | 'sustainSeconds'>,
  sustainState: SustainState,
  scoringTime: number,
): boolean {
  return (
    Boolean(note.starPower) &&
    sustainState === 'holding' &&
    note.sustainSeconds > 0.03 &&
    scoringTime < note.timeSeconds + note.sustainSeconds
  )
}
