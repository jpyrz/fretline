import type { GamepadBinding } from '../types/game'

interface GamepadState {
  buttons: readonly Pick<GamepadButton, 'pressed'>[]
  axes: readonly number[]
}

const AXIS_THRESHOLD = 0.55

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
  const delta = value - (binding.rest ?? 0)
  return binding.direction === 1
    ? delta > AXIS_THRESHOLD
    : delta < -AXIS_THRESHOLD
}
