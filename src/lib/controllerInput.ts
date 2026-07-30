import type {
  GamepadBinding,
  GamepadControllerMapping,
} from '../types/game'

interface GamepadState {
  buttons: readonly Pick<GamepadButton, 'pressed'>[]
  axes: readonly number[]
  mapping?: string
}

interface IdentifiedGamepadState extends GamepadState {
  id: string
  index: number
  timestamp: number
}

export interface MappedGamepadSnapshot<T extends IdentifiedGamepadState> {
  gamepad: T
  frets: boolean[]
  strumDirections: { up: boolean; down: boolean }
  starPower: boolean
  whammy: number
  start: boolean
}

const AXIS_THRESHOLD = 0.55
const MIN_AXIS_TARGET_TOLERANCE = 0.12
const MAX_AXIS_TARGET_TOLERANCE = 0.3

export function describeGamepadBinding(
  binding: GamepadBinding,
  fractionDigits = 2,
): string {
  if (binding.type === 'button') return `button ${binding.index}`
  if (binding.value === undefined) {
    return `axis ${binding.index} ${binding.direction > 0 ? '+' : '−'}`
  }
  const rest =
    binding.rest === undefined
      ? ''
      : ` · rest ${binding.rest.toFixed(fractionDigits)}`
  return `axis ${binding.index} · target ${binding.value.toFixed(fractionDigits)}${rest}`
}

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

export function gamepadAnalogValue(
  gamepad: GamepadState,
  binding?: GamepadBinding,
): number {
  if (!binding) return 0
  if (binding.type === 'button') {
    return gamepad.buttons[binding.index]?.pressed ? 1 : 0
  }

  const rest = binding.rest ?? 0
  const current = gamepad.axes[binding.index] ?? rest
  const target =
    binding.value ?? rest + binding.direction * Math.max(1, Math.abs(rest))
  const travel = target - rest
  if (Math.abs(travel) < 0.01) return 0
  return Math.max(0, Math.min(1, (current - rest) / travel))
}

/**
 * Mappings saved before exact axis targets were captured only knew polarity.
 * Preserve those mappings when the strum bar is a conventional bipolar axis.
 * Current POV-hat mappings bypass this path because they include exact values.
 */
function legacyAxisStrumDownBinding(
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

function sameAxisTargetDirection(
  gamepad: GamepadState,
  strumUp: GamepadBinding,
  strumDown: GamepadBinding,
): { up: boolean; down: boolean } | null {
  if (
    strumUp.type !== 'axis' ||
    strumDown.type !== 'axis' ||
    strumUp.index !== strumDown.index ||
    strumUp.value === undefined ||
    strumDown.value === undefined
  ) {
    return null
  }

  const current =
    gamepad.axes[strumUp.index] ??
    strumUp.rest ??
    strumDown.rest ??
    0
  const upRest = strumUp.rest ?? 0
  const downRest = strumDown.rest ?? upRest
  const travelToUp = Math.abs(strumUp.value - upRest)
  const travelToDown = Math.abs(strumDown.value - downRest)
  const neutralRadius =
    Math.min(travelToUp, travelToDown, AXIS_THRESHOLD) * 0.45
  const distanceFromRest = Math.min(
    Math.abs(current - upRest),
    Math.abs(current - downRest),
  )

  if (distanceFromRest <= neutralRadius) {
    return { up: false, down: false }
  }

  const distanceToUp = Math.abs(current - strumUp.value)
  const distanceToDown = Math.abs(current - strumDown.value)
  return distanceToUp <= distanceToDown
    ? { up: true, down: false }
    : { up: false, down: true }
}

export function gamepadStrumDirections(
  gamepad: GamepadState,
  strumUp: GamepadBinding,
  strumDown: GamepadBinding,
): { up: boolean; down: boolean } {
  const standardMapping = gamepad.mapping === 'standard'
  const standardUp =
    standardMapping && Boolean(gamepad.buttons[12]?.pressed)
  const standardDown =
    standardMapping && Boolean(gamepad.buttons[13]?.pressed)

  if (standardUp || standardDown) {
    return { up: standardUp, down: standardDown }
  }

  const sameAxisDirection = sameAxisTargetDirection(
    gamepad,
    strumUp,
    strumDown,
  )
  if (sameAxisDirection) return sameAxisDirection

  const downBinding = legacyAxisStrumDownBinding(strumUp, strumDown)
  const mappedUp = gamepadBindingActive(gamepad, strumUp)
  const mappedDown = gamepadBindingActive(gamepad, downBinding)

  return exclusiveStrumDirections(mappedUp, mappedDown)
}

export function exclusiveStrumDirections(
  up: boolean,
  down: boolean,
): { up: boolean; down: boolean } {
  if (down) return { up: false, down: true }
  return { up, down: false }
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

export function gamepadStarPowerActive(
  gamepad: GamepadState,
  starPower?: GamepadBinding,
): boolean {
  if (starPower && gamepadBindingActive(gamepad, starPower)) return true
  return (
    gamepad.mapping === 'standard' &&
    Boolean(gamepad.buttons[8]?.pressed)
  )
}

export function mappedGamepadSnapshot<T extends IdentifiedGamepadState>(
  mapping: GamepadControllerMapping,
  gamepads: readonly (T | null)[],
): MappedGamepadSnapshot<T> | null {
  const indexedGamepad = gamepads[mapping.gamepadIndex]
  const gamepad =
    indexedGamepad?.id === mapping.gamepadId
      ? indexedGamepad
      : gamepads.find(
          (candidate): candidate is T =>
            candidate?.id === mapping.gamepadId,
        )
  if (!gamepad) return null

  return {
    gamepad,
    frets: mapping.frets.map((binding) =>
      gamepadBindingActive(gamepad, binding),
    ),
    strumDirections: gamepadStrumDirections(
      gamepad,
      mapping.strumUp,
      mapping.strumDown,
    ),
    starPower: gamepadStarPowerActive(gamepad, mapping.starPower),
    whammy: gamepadAnalogValue(gamepad, mapping.whammy),
    start: gamepadStartActive(gamepad, mapping.start),
  }
}
