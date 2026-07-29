import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBOARD_MAPPING,
  formatKeyboardCode,
  keyboardEventCode,
  keyboardMappingConflicts,
  normalizeKeyboardMapping,
  withKeyboardBinding,
} from './keyboardMapping'

describe('keyboard mapping', () => {
  it('restores defaults when stored data is missing or malformed', () => {
    expect(normalizeKeyboardMapping(null)).toEqual(DEFAULT_KEYBOARD_MAPPING)
    expect(
      normalizeKeyboardMapping({
        frets: ['KeyZ'],
        strumDown: 12,
      }),
    ).toEqual({
      ...DEFAULT_KEYBOARD_MAPPING,
      frets: ['KeyZ', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],
    })
  })

  it('updates an individual binding without mutating the source', () => {
    const next = withKeyboardBinding(
      DEFAULT_KEYBOARD_MAPPING,
      'orange',
      'KeyL',
    )
    expect(next.frets).toEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyL'])
    expect(DEFAULT_KEYBOARD_MAPPING.frets[4]).toBe('KeyG')
  })

  it('falls back to event.key when iOS does not expose event.code', () => {
    expect(keyboardEventCode({ code: 'Unidentified', key: 'ø' })).toBe(
      'Key:ø',
    )
    expect(keyboardEventCode({ code: 'ArrowDown', key: 'ArrowDown' })).toBe(
      'ArrowDown',
    )
  })

  it('labels common physical keys clearly', () => {
    expect(formatKeyboardCode('KeyF')).toBe('F')
    expect(formatKeyboardCode('ArrowDown')).toBe('Down Arrow')
    expect(formatKeyboardCode('Space')).toBe('Space')
  })

  it('reports ambiguous bindings while allowing back and pause to match', () => {
    expect(keyboardMappingConflicts(DEFAULT_KEYBOARD_MAPPING)).toEqual([])
    const conflicted = withKeyboardBinding(
      DEFAULT_KEYBOARD_MAPPING,
      'strumUp',
      'KeyA',
    )
    expect(keyboardMappingConflicts(conflicted)).toEqual([
      { code: 'KeyA', bindings: ['green', 'strumUp'] },
    ])
  })
})
