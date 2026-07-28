import { describe, expect, it } from 'vitest'
import type { GamepadBinding } from '../types/game'
import {
  activeGamepadBindings,
  gamepadBindingActive,
} from './controllerInput'

function gamepad(buttons: boolean[], axes: number[]) {
  return {
    buttons: buttons.map((pressed) => ({ pressed })),
    axes,
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
      { type: 'axis', index: 0, direction: 1, rest: -1 },
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
})
