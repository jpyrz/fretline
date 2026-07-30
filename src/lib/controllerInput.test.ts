import { describe, expect, it } from 'vitest'
import type {
  GamepadBinding,
  GamepadControllerMapping,
} from '../types/game'
import {
  activeGamepadBindings,
  exclusiveStrumDirections,
  gamepadAnalogValue,
  gamepadBindingActive,
  gamepadStartActive,
  gamepadStrumDirections,
  mappedGamepadSnapshot,
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

  it('normalizes a whammy axis from rest to its captured full-travel value', () => {
    const binding: GamepadBinding = {
      type: 'axis',
      index: 2,
      direction: 1,
      rest: -1,
      value: 1,
    }

    expect(gamepadAnalogValue(gamepad([], [0, 0, -1]), binding)).toBe(0)
    expect(gamepadAnalogValue(gamepad([], [0, 0, 0]), binding)).toBe(0.5)
    expect(gamepadAnalogValue(gamepad([], [0, 0, 1]), binding)).toBe(1)
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

  it('prioritizes a standard d-pad direction over an ambiguous saved binding', () => {
    const buttons = Array.from({ length: 14 }, () => false)
    const ambiguousUp: GamepadBinding = {
      type: 'axis',
      index: 0,
      direction: 1,
      rest: -1,
    }
    const down: GamepadBinding = { type: 'button', index: 13 }
    buttons[13] = true

    expect(
      gamepadStrumDirections(
        gamepad(buttons, [1], 'standard'),
        ambiguousUp,
        down,
      ),
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
        gamepad([], [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0.4]),
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

  it('gives down priority when a raw controller activates both directions', () => {
    expect(exclusiveStrumDirections(true, true)).toEqual({
      up: false,
      down: true,
    })
    expect(exclusiveStrumDirections(true, false)).toEqual({
      up: true,
      down: false,
    })
  })

  it('finds a remapped controller by id and returns one shared snapshot', () => {
    const mapping: GamepadControllerMapping = {
      source: 'gamepad',
      gamepadId: 'guitar',
      gamepadIndex: 0,
      frets: [
        { type: 'button', index: 0 },
        { type: 'button', index: 1 },
        { type: 'button', index: 2 },
        { type: 'button', index: 3 },
        { type: 'button', index: 4 },
      ],
      strumUp: { type: 'button', index: 12 },
      strumDown: { type: 'button', index: 13 },
      starPower: { type: 'button', index: 8 },
      whammy: {
        type: 'axis',
        index: 0,
        direction: 1,
        rest: -1,
        value: 1,
      },
      start: { type: 'button', index: 9 },
    }
    const wrongIndex = {
      ...gamepad([false], []),
      id: 'another controller',
      index: 0,
      timestamp: 10,
    }
    const guitar = {
      ...gamepad(
        [
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          true,
          false,
          false,
          false,
          true,
        ],
        [0],
      ),
      id: 'guitar',
      index: 1,
      timestamp: 20,
    }

    const snapshot = mappedGamepadSnapshot(mapping, [
      wrongIndex,
      guitar,
    ])

    expect(snapshot?.gamepad).toBe(guitar)
    expect(snapshot?.frets).toEqual([true, false, false, false, false])
    expect(snapshot?.strumDirections).toEqual({
      up: false,
      down: true,
    })
    expect(snapshot?.starPower).toBe(true)
    expect(snapshot?.whammy).toBe(0.5)
    expect(snapshot?.start).toBe(true)
  })
})
