import type { KeyboardMapping } from '../types/game'

export type KeyboardBindingId =
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'strumUp'
  | 'strumDown'
  | 'select'
  | 'back'
  | 'pause'
  | 'starPower'
  | 'whammy'

export const DEFAULT_KEYBOARD_MAPPING: KeyboardMapping = {
  frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],
  strumUp: 'ArrowUp',
  strumDown: 'ArrowDown',
  select: 'Enter',
  back: 'Escape',
  pause: 'Escape',
  starPower: 'Space',
  whammy: 'KeyW',
}

const VALID_CODE = /^(?:Key:[\s\S]+|[A-Za-z][A-Za-z0-9]+)$/

function validCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && VALID_CODE.test(value)
    ? value
    : fallback
}

export function normalizeKeyboardMapping(
  value: unknown,
): KeyboardMapping {
  if (!value || typeof value !== 'object') {
    return {
      ...DEFAULT_KEYBOARD_MAPPING,
      frets: [...DEFAULT_KEYBOARD_MAPPING.frets],
    }
  }

  const candidate = value as Partial<KeyboardMapping>
  const frets = Array.isArray(candidate.frets) ? candidate.frets : []
  return {
    frets: DEFAULT_KEYBOARD_MAPPING.frets.map((fallback, index) =>
      validCode(frets[index], fallback),
    ) as KeyboardMapping['frets'],
    strumUp: validCode(
      candidate.strumUp,
      DEFAULT_KEYBOARD_MAPPING.strumUp,
    ),
    strumDown: validCode(
      candidate.strumDown,
      DEFAULT_KEYBOARD_MAPPING.strumDown,
    ),
    select: validCode(
      candidate.select,
      DEFAULT_KEYBOARD_MAPPING.select,
    ),
    back: validCode(candidate.back, DEFAULT_KEYBOARD_MAPPING.back),
    pause: validCode(candidate.pause, DEFAULT_KEYBOARD_MAPPING.pause),
    starPower: validCode(
      candidate.starPower,
      DEFAULT_KEYBOARD_MAPPING.starPower,
    ),
    whammy: validCode(candidate.whammy, DEFAULT_KEYBOARD_MAPPING.whammy),
  }
}

export function keyboardEventCode(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
): string {
  return event.code && event.code !== 'Unidentified'
    ? event.code
    : `Key:${event.key}`
}

export function keyboardBindingCode(
  mapping: KeyboardMapping,
  binding: KeyboardBindingId,
): string {
  const fretIndex = [
    'green',
    'red',
    'yellow',
    'blue',
    'orange',
  ].indexOf(binding)
  return fretIndex >= 0
    ? mapping.frets[fretIndex]
    : mapping[binding as Exclude<KeyboardBindingId, 'green' | 'red' | 'yellow' | 'blue' | 'orange'>]
}

export function withKeyboardBinding(
  mapping: KeyboardMapping,
  binding: KeyboardBindingId,
  code: string,
): KeyboardMapping {
  const fretIndex = [
    'green',
    'red',
    'yellow',
    'blue',
    'orange',
  ].indexOf(binding)
  if (fretIndex >= 0) {
    const frets = [...mapping.frets] as KeyboardMapping['frets']
    frets[fretIndex] = code
    return { ...mapping, frets }
  }
  return { ...mapping, [binding]: code }
}

export function formatKeyboardCode(code: string): string {
  if (code.startsWith('Key:')) return code.slice(4)
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)

  const labels: Record<string, string> = {
    ArrowUp: 'Up Arrow',
    ArrowDown: 'Down Arrow',
    ArrowLeft: 'Left Arrow',
    ArrowRight: 'Right Arrow',
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Tab: 'Tab',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Control',
    ControlRight: 'Right Control',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    MetaLeft: 'Left Command',
    MetaRight: 'Right Command',
  }
  return labels[code] ?? code
}

export function keyboardMappingConflicts(
  mapping: KeyboardMapping,
): Array<{ code: string; bindings: KeyboardBindingId[] }> {
  const bindings: KeyboardBindingId[] = [
    'green',
    'red',
    'yellow',
    'blue',
    'orange',
    'strumUp',
    'strumDown',
    'select',
    'back',
    'pause',
    'starPower',
    'whammy',
  ]
  const byCode = new Map<string, KeyboardBindingId[]>()
  for (const binding of bindings) {
    const code = keyboardBindingCode(mapping, binding)
    byCode.set(code, [...(byCode.get(code) ?? []), binding])
  }
  return [...byCode.entries()]
    .filter(([, assigned]) => {
      if (assigned.length < 2) return false
      return !(
        assigned.length === 2 &&
        assigned.includes('back') &&
        assigned.includes('pause')
      )
    })
    .map(([code, assigned]) => ({ code, bindings: assigned }))
}
