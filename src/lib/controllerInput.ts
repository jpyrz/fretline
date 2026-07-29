import type { GamepadBinding } from '../types/game'

interface GamepadState {
  buttons: readonly Pick<GamepadButton, 'pressed'>[]
  axes: readonly number[]
  mapping?: string
}

const AXIS_THRESHOLD = 0.55
const MIN_AXIS_TARGET_TOLERANCE = 0.12
const MAX_AXIS_TARGET_TOLERANCE = 0.3

export function activeGamepadBindings(
  gamepad: GamepadState,
  axisBaseline: readonly number[],
): GamepadBinding[] {
  const bindings: GamepadBinding[] = []

  gamepad.buttons.forEach((button, index) => {
    if (button.pressed) bindings.push({ type: 'button', index })
  })

  gamepad.axes.forEach((value, index) => {
    const rest = axisBaseline[index] ?? 0
    const delta = value - rest
    if (Math.abs(delta) > AXIS_THRESHOLD) {
      bindings.push({
        type: 'axis',
        index,
        direction: delta > 0 ? 1 : -1,
        rest,
        value,
      })
    }
  })

  return bindings
}

export function gamepadBindingActive(
  gamepad: GamepadState,
  binding: GamepadBinding,
): boolean {
  if (binding.type === 'button') {
    return Boolean(gamepad.buttons[binding.index]?.pressed)
  }

  const value = gamepad.axes[binding.index] ?? binding.rest ?? 0
  if (binding.value !== undefined) {
    const travel = Math.abs(binding.value - (binding.rest ?? 0))
    const tolerance = Math.min(
      MAX_AXIS_TARGET_TOLERANCE,
      Math.max(MIN_AXIS_TARGET_TOLERANCE, travel * 0.25),
    )
    return Math.abs(value - binding.value) <= tolerance
  }

  const delta = value - (binding.rest ?? 0)
  return binding.direction === 1
    ? delta > AXIS_THRESHOLD
    : delta < -AXIS_THRESHOLD
}

function repairedStrumDownBinding(
  strumUp: GamepadBinding,
  strumDown: GamepadBinding,
): GamepadBinding {
  if (
    strumUp.type === 'axis' &&
    strumDown.type === 'axis' &&
    strumUp.index === strumDown.index &&
    strumUp.direction === strumDown.direction &&
    strumUp.value === undefined &&
    strumDown.value === undefined
  ) {
    return {
      ...strumDown,
      direction: strumDown.direction === 1 ? -1 : 1,
      rest: strumDown.rest ?? strumUp.rest,
    }
  }
  return strumDown
}

export function gamepadStrumDirections(
  gamepad: GamepadState,
  strumUp: GamepadBinding,
  strumDown: GamepadBinding,
): { up: boolean; down: boolean } {
  const downBinding = repairedStrumDownBinding(strumUp, strumDown)
  const standardMapping = gamepad.mapping === 'standard'

  return {
    up:
      gamepadBindingActive(gamepad, strumUp) ||
      (standardMapping && Boolean(gamepad.buttons[12]?.pressed)),
    down:
      gamepadBindingActive(gamepad, downBinding) ||
      (standardMapping && Boolean(gamepad.buttons[13]?.pressed)),
  }
}

export function gamepadStartActive(
  gamepad: GamepadState,
  start?: GamepadBinding,
): boolean {
  if (start && gamepadBindingActive(gamepad, start)) return true
  return (
    gamepad.mapping === 'standard' &&
    Boolean(gamepad.buttons[9]?.pressed)
  )
}
