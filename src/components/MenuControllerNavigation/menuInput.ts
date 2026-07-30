import {
  exclusiveStrumDirections,
  mappedGamepadSnapshot,
} from '../../lib/controllerInput'
import { directHidSnapshot } from '../../lib/directHidController'
import { hidBindingActive } from '../../lib/hidInput'
import type { ControllerMapping } from '../../types/game'

export type MenuAction =
  | 'previous'
  | 'next'
  | 'confirm'
  | 'back'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'start'

export type MenuInputState = Record<MenuAction, boolean>

export function emptyMenuInputState(): MenuInputState {
  return {
    previous: false,
    next: false,
    confirm: false,
    back: false,
    yellow: false,
    blue: false,
    orange: false,
    start: false,
  }
}

export function readMenuInput(mapping: ControllerMapping): MenuInputState {
  if (mapping.source === 'hid') {
    const { reports } = directHidSnapshot(mapping.device)
    const strumDirections = exclusiveStrumDirections(
      hidBindingActive(reports, mapping.strumUp),
      hidBindingActive(reports, mapping.strumDown),
    )
    return {
      previous: strumDirections.up,
      next: strumDirections.down,
      confirm: hidBindingActive(reports, mapping.frets[0]),
      back: hidBindingActive(reports, mapping.frets[1]),
      yellow: hidBindingActive(reports, mapping.frets[2]),
      blue: hidBindingActive(reports, mapping.frets[3]),
      orange: hidBindingActive(reports, mapping.frets[4]),
      start: mapping.start
        ? hidBindingActive(reports, mapping.start)
        : false,
    }
  }

  const gamepads = navigator.getGamepads?.() ?? []
  const snapshot = mappedGamepadSnapshot(mapping, gamepads)
  if (!snapshot) return emptyMenuInputState()

  return {
    previous: snapshot.strumDirections.up,
    next: snapshot.strumDirections.down,
    confirm: snapshot.frets[0],
    back: snapshot.frets[1],
    yellow: snapshot.frets[2],
    blue: snapshot.frets[3],
    orange: snapshot.frets[4],
    start: snapshot.start,
  }
}
