import { describe, expect, it } from 'vitest'
import type { GamepadBinding } from '../types/game'
import {
  activeGamepadBindings,
  gamepadBindingActive,
  gamepadStartActive,
  gamepadStrumDirections,
} from './controllerInput'

function gamepad(
  buttons: boolean[],
  axes: number[],
  mapping?: string,
) {
  return {
    buttons: buttons.map((pressed) => ({ pressed })),
    axes,
    mapping,
  }
}

describe('controller input', () => {
  it('captures ordinary gamepad buttons', () => {
    expect(activeGamepadBindings(gamepad([false, true], []), [])).toEqual([
      { type: 'button', index: 1 },
    ])
  })

  it('ignores a non-zero resting guitar axis', () => {
    expect(activeGamepadBindings(gamepad([], [-1]), [-1])).toEqual([])
  })

  it('captures axis movement relative to its calibrated rest value', () => {
    expect(activeGamepadBindings(gamepad([], [1]), [-1])).toEqual([
      { type: 'axis', index: 0, direction: 1, rest: -1, value: 1 },
    ])
  })

  it('uses the saved rest value during gameplay', () => {
    const binding: GamepadBinding = {
      type: 'axis',
      index: 0,
      direction: 1,
      rest: -1,
    }

    expect(gamepadBindingActive(gamepad([], [-1]), binding)).toBe(false)
    expect(gamepadBindingActive(gamepad([], [0]), binding)).toBe(true)
    expect(gamepadBindingActive(gamepad([], [1]), binding)).toBe(true)
  })

  it('keeps older mappings that assumed a zero-centered axis working', () => {
    const binding: GamepadBinding = {
      type: 'axis',
      index: 0,
      direction: -1,
    }

    expect(gamepadBindingActive(gamepad([], [0]), binding)).toBe(false)
    expect(gamepadBindingActive(gamepad([], [-1]), binding)).toBe(true)
  })

  it('uses the standard d-pad as a guitar strum fallback', () => {
    const buttons = Array.from({ length: 14 }, () => false)
    const up: GamepadBinding = { type: 'button', index: 20 }
    const down: GamepadBinding = { type: 'button', index: 21 }

    buttons[12] = true
    expect(
      gamepadStrumDirections(gamepad(buttons, [], 'standard'), up, down),
    ).toEqual({ up: true, down: false })

    buttons[12] = false
    buttons[13] = true
    expect(
      gamepadStrumDirections(gamepad(buttons, [], 'standard'), up, down),
    ).toEqual({ up: false, down: true })
  })

  it('repairs an older mapping that saved both axis directions identically', () => {
    const up: GamepadBinding = {
      type: 'axis',
      index: 0,
      direction: -1,
      rest: 0,
    }
    const brokenDown: GamepadBinding = { ...up }

    expect(
      gamepadStrumDirections(gamepad([], [1]), up, brokenDown),
    ).toEqual({ up: false, down: true })
  })

  it('distinguishes two POV-hat positions on the same side of neutral', () => {
    const up: GamepadBinding = {
      type: 'axis',
      index: 9,
      direction: 1,
      rest: -1,
      value: -0.2,
    }
    const down: GamepadBinding = {
      type: 'axis',
      index: 9,
      direction: 1,
      rest: -1,
      value: 0.8,
    }

    expect(
      gamepadStrumDirections(
        gamepad([], [-1, 0, 0, 0, 0, 0, 0, 0, 0, -0.2]),
        up,
        down,
      ),
    ).toEqual({ up: true, down: false })
    expect(
      gamepadStrumDirections(
        gamepad([], [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0.8]),
        up,
        down,
      ),
    ).toEqual({ up: false, down: true })
    expect(
      gamepadStrumDirections(
        gamepad([], [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1]),
        up,
        down,
      ),
    ).toEqual({ up: false, down: false })
  })

  it('uses standard Start when an older mapping has no pause binding', () => {
    const buttons = Array.from({ length: 10 }, () => false)
    buttons[9] = true
    expect(gamepadStartActive(gamepad(buttons, [], 'standard'))).toBe(true)
  })
})
