import { describeGamepadBinding } from '../../lib/controllerInput'
import type {
  GamepadBinding,
  HidAnalogBinding,
  HidBinding,
} from '../../types/game'

export const MAPPING_STEPS = [
  'Green fret',
  'Red fret',
  'Yellow fret',
  'Blue fret',
  'Orange fret',
  'Strum up',
  'Strum down',
  'Star power / select',
  'Whammy bar',
  'Start / pause',
]

export const STRUM_UP_STEP = 5
export const STRUM_DOWN_STEP = 6
export const STAR_POWER_STEP = 7
export const WHAMMY_STEP = 8
export const START_STEP = 9

export type CapturedBinding =
  | GamepadBinding
  | HidBinding
  | HidAnalogBinding

export function bindingLabel(binding: CapturedBinding): string {
  if (binding.type === 'button' || binding.type === 'axis') {
    return describeGamepadBinding(binding)
  }
  if (binding.type === 'hid-axis') {
    return `direct axis ${binding.reportId}:${binding.byteIndex}`
  }
  return `direct input ${binding.reportId}:${binding.byteIndex}`
}

export function sameBinding(
  left: CapturedBinding,
  right: CapturedBinding,
): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'button' && right.type === 'button') {
    return left.index === right.index
  }
  if (left.type === 'axis' && right.type === 'axis') {
    if (left.index !== right.index) return false
    if (left.value !== undefined && right.value !== undefined) {
      return Math.abs(left.value - right.value) < 0.08
    }
    return left.direction === right.direction
  }
  if (left.type === 'hid' && right.type === 'hid') {
    return (
      left.reportId === right.reportId &&
      left.byteIndex === right.byteIndex &&
      left.mask === right.mask &&
      left.activeValue === right.activeValue
    )
  }
  if (left.type === 'hid-axis' && right.type === 'hid-axis') {
    return (
      left.reportId === right.reportId &&
      left.byteIndex === right.byteIndex
    )
  }
  return false
}

export function mappingPrompt(step: number, direct = false): string {
  if (step === WHAMMY_STEP) {
    return direct
      ? `Move ${MAPPING_STEPS[step]} fully and briefly hold it.`
      : `Move ${MAPPING_STEPS[step]} fully.`
  }
  return direct
    ? `Press and briefly hold ${MAPPING_STEPS[step]}.`
    : `Press ${MAPPING_STEPS[step]}.`
}

export function cloneReports(
  reports: ReadonlyMap<number, Uint8Array>,
): Map<number, Uint8Array> {
  return new Map(
    [...reports].map(([reportId, bytes]) => [
      reportId,
      Uint8Array.from(bytes),
    ]),
  )
}
