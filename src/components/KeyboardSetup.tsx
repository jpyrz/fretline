import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_KEYBOARD_MAPPING,
  formatKeyboardCode,
  keyboardBindingCode,
  keyboardEventCode,
  keyboardMappingConflicts,
  withKeyboardBinding,
  type KeyboardBindingId,
} from '../lib/keyboardMapping'
import type { KeyboardMapping } from '../types/game'
import styles from './KeyboardSetup.module.scss'

interface BindingDefinition {
  id: KeyboardBindingId
  label: string
  description: string
  lane?: number
}

const BINDINGS: BindingDefinition[] = [
  { id: 'green', label: 'Green fret', description: 'Lane one', lane: 0 },
  { id: 'red', label: 'Red fret', description: 'Lane two', lane: 1 },
  { id: 'yellow', label: 'Yellow fret', description: 'Lane three', lane: 2 },
  { id: 'blue', label: 'Blue fret', description: 'Lane four', lane: 3 },
  { id: 'orange', label: 'Orange fret', description: 'Lane five', lane: 4 },
  {
    id: 'strumUp',
    label: 'Strum up',
    description: 'Menu up and gameplay strum',
  },
  {
    id: 'strumDown',
    label: 'Strum down',
    description: 'Menu down and gameplay strum',
  },
  { id: 'select', label: 'Select', description: 'Confirm menu choices' },
  { id: 'back', label: 'Back', description: 'Return to the previous menu' },
  { id: 'pause', label: 'Pause', description: 'Pause or resume a song' },
]

function bindingLabel(id: KeyboardBindingId): string {
  return BINDINGS.find((binding) => binding.id === id)?.label ?? id
}

export function KeyboardSetup({
  mapping,
  onChange,
}: {
  mapping: KeyboardMapping
  onChange: (mapping: KeyboardMapping) => void
}) {
  const [capturing, setCapturing] = useState<KeyboardBindingId | null>(null)
  const conflicts = useMemo(
    () => keyboardMappingConflicts(mapping),
    [mapping],
  )

  useEffect(() => {
    if (!capturing) return

    const captureKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      onChange(
        withKeyboardBinding(
          mapping,
          capturing,
          keyboardEventCode(event),
        ),
      )
      setCapturing(null)
    }

    window.addEventListener('keydown', captureKey, true)
    return () => window.removeEventListener('keydown', captureKey, true)
  }, [capturing, mapping, onChange])

  return (
    <section
      className={styles.setup}
      data-controller-capturing={capturing ? 'true' : undefined}
    >
      <header>
        <div>
          <p>Keyboard profile</p>
          <h3>Map this keyboard</h3>
          <span>
            Select an action, then press the physical key you want to use.
          </span>
        </div>
        <button
          type="button"
          data-controller-nav-item
          onClick={() =>
            onChange({
              ...DEFAULT_KEYBOARD_MAPPING,
              frets: [...DEFAULT_KEYBOARD_MAPPING.frets],
            })
          }
        >
          Reset defaults
        </button>
      </header>

      <div className={styles.bindingList}>
        {BINDINGS.map((binding) => {
          const code = keyboardBindingCode(mapping, binding.id)
          const isCapturing = capturing === binding.id
          return (
            <button
              type="button"
              key={binding.id}
              data-controller-nav-item
              data-lane={binding.lane}
              data-capturing={isCapturing || undefined}
              aria-label={`Map ${binding.label}, currently ${formatKeyboardCode(code)}`}
              onClick={() => setCapturing(binding.id)}
            >
              <i aria-hidden="true" />
              <span>
                <strong>{binding.label}</strong>
                <small>{binding.description}</small>
              </span>
              <kbd>
                {isCapturing ? 'Press a key…' : formatKeyboardCode(code)}
              </kbd>
            </button>
          )
        })}
      </div>

      {capturing && (
        <div className={styles.captureNotice} role="status">
          <span>
            Listening for <strong>{bindingLabel(capturing)}</strong>
          </span>
          <button type="button" onClick={() => setCapturing(null)}>
            Cancel
          </button>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className={styles.conflicts} role="status">
          <strong>Overlapping bindings</strong>
          {conflicts.map((conflict) => (
            <span key={conflict.code}>
              {formatKeyboardCode(conflict.code)} controls{' '}
              {conflict.bindings.map(bindingLabel).join(' and ')}.
            </span>
          ))}
          <small>
            These bindings are saved, but simultaneous actions may not behave
            as expected.
          </small>
        </div>
      )}

      <p className={styles.storageNote}>
        This profile is saved only on this device, so your iPhone keyboard can
        use different controls from your laptop.
      </p>
    </section>
  )
}
