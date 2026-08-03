import {
  exclusiveStrumDirections,
  mappedGamepadSnapshot,
} from '../../lib/controllerInput'
import { directHidSnapshot } from '../../lib/directHidController'
import { hidAnalogValue, hidBindingActive } from '../../lib/hidInput'
import type { ControllerMapping, Lane } from '../../types/game'

export interface ControllerState {
  connected: boolean
  lanes: Lane[]
  strumDirections: StrumDirections
  starPower: boolean
  whammy: number
  timestamp: number
}

export interface StrumDirections {
  up: boolean
  down: boolean
}

export function newlyPressedStrumDirections(
  current: StrumDirections,
  previous: StrumDirections,
): StrumDirections {
  return {
    up: current.up && !previous.up,
    down: current.down && !previous.down,
  }
}

export function normalizePerformanceTimestamp(timestamp: number): number {
  if (timestamp > performance.timeOrigin) {
    return timestamp - performance.timeOrigin
  }
  return timestamp
}

export function readControllerState(
  mapping: ControllerMapping | null,
  now: number,
): ControllerState | null {
  if (!mapping) return null

  if (mapping.source === 'hid') {
    const snapshot = directHidSnapshot(mapping.device)
    const strumDirections = exclusiveStrumDirections(
      hidBindingActive(snapshot.reports, mapping.strumUp),
      hidBindingActive(snapshot.reports, mapping.strumDown),
    )
    return {
      connected: true,
      lanes: mapping.frets
        .map((binding, index) =>
          hidBindingActive(snapshot.reports, binding)
            ? (index as Lane)
            : null,
        )
        .filter((lane): lane is Lane => lane !== null),
      strumDirections,
      starPower: mapping.starPower
        ? hidBindingActive(snapshot.reports, mapping.starPower)
        : false,
      whammy: hidAnalogValue(snapshot.reports, mapping.whammy),
      timestamp: snapshot.timestamp || now,
    }
  }

  const snapshot = mappedGamepadSnapshot(
    mapping,
    navigator.getGamepads?.() ?? [],
  )
  if (!snapshot) {
    return {
      connected: false,
      lanes: [],
      strumDirections: { up: false, down: false },
      starPower: false,
      whammy: 0,
      timestamp: now,
    }
  }

  return {
    connected: true,
    lanes: snapshot.frets
      .map((active, index) => (active ? (index as Lane) : null))
      .filter((lane): lane is Lane => lane !== null),
    strumDirections: snapshot.strumDirections,
    starPower: snapshot.starPower,
    whammy: snapshot.whammy,
    timestamp:
      snapshot.gamepad.timestamp > 0
        ? normalizePerformanceTimestamp(snapshot.gamepad.timestamp)
        : now,
  }
}
