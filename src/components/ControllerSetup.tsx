import { useEffect, useRef, useState } from 'react'
import type {
  ControllerMapping,
  GamepadBinding,
} from '../types/game'
import styles from './ControllerSetup.module.scss'

const STEPS = [
  'Green fret',
  'Red fret',
  'Yellow fret',
  'Blue fret',
  'Orange fret',
  'Strum up',
  'Strum down',
]

function activeBindings(gamepad: Gamepad): GamepadBinding[] {
  const bindings: GamepadBinding[] = []
  gamepad.buttons.forEach((button, index) => {
    if (button.pressed) bindings.push({ type: 'button', index })
  })
  gamepad.axes.forEach((value, index) => {
    if (Math.abs(value) > 0.65) {
      bindings.push({
        type: 'axis',
        index,
        direction: value > 0 ? 1 : -1,
      })
    }
  })
  return bindings
}

function bindingLabel(binding: GamepadBinding): string {
  return binding.type === 'button'
    ? `button ${binding.index}`
    : `axis ${binding.index} ${binding.direction > 0 ? '+' : '−'}`
}

interface ControllerSetupProps {
  mapping: ControllerMapping | null
  onChange: (mapping: ControllerMapping | null) => void
}

export function ControllerSetup({
  mapping,
  onChange,
}: ControllerSetupProps) {
  const [gamepad, setGamepad] = useState<{ id: string; index: number } | null>(
    null,
  )
  const [captured, setCaptured] = useState<GamepadBinding[]>([])
  const [message, setMessage] = useState('')
  const armed = useRef(false)
  const mappingActive = Boolean(gamepad && captured.length < STEPS.length)

  const beginMapping = () => {
    const connected = [...(navigator.getGamepads?.() ?? [])].find(Boolean)
    if (!connected) {
      setMessage(
        'No controller detected yet. Press a button on it, then try again.',
      )
      return
    }
    setGamepad({ id: connected.id, index: connected.index })
    setCaptured([])
    setMessage('Release every button to begin.')
    armed.current = false
  }

  useEffect(() => {
    if (!mappingActive || !gamepad) return
    let frame = 0

    const poll = () => {
      const current =
        navigator.getGamepads?.()[gamepad.index] ??
        [...(navigator.getGamepads?.() ?? [])].find(
          (candidate) => candidate?.id === gamepad.id,
        )

      if (!current) {
        setMessage('Controller disconnected. Reconnect it and start again.')
        setGamepad(null)
        return
      }

      const active = activeBindings(current)
      if (active.length === 0) {
        armed.current = true
        setMessage(`Press ${STEPS[captured.length]}.`)
      } else if (armed.current) {
        const binding = active[0]
        armed.current = false
        setCaptured((previous) => {
          const next = [...previous, binding]
          if (next.length === STEPS.length) {
            onChange({
              gamepadId: current.id,
              gamepadIndex: current.index,
              frets: [
                next[0],
                next[1],
                next[2],
                next[3],
                next[4],
              ],
              strumUp: next[5],
              strumDown: next[6],
            })
            setMessage('Mapping saved locally.')
            setGamepad(null)
          }
          return next
        })
      }

      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [captured.length, gamepad, mappingActive, onChange])

  return (
    <section className={styles.panel} aria-labelledby="controller-title">
      <div>
        <p className={styles.eyebrow}>Input device</p>
        <h2 id="controller-title">Guitar controller</h2>
        <p className={styles.description}>
          Map any controller the browser exposes as a gamepad. Axis-based strum
          bars are supported.
        </p>
      </div>

      {mapping ? (
        <div className={styles.connected}>
          <span className={styles.statusDot} />
          <div>
            <strong>{mapping.gamepadId}</strong>
            <small>
              Green is {bindingLabel(mapping.frets[0])}; strum is{' '}
              {bindingLabel(mapping.strumUp)}
            </small>
          </div>
        </div>
      ) : (
        <p className={styles.unmapped}>Keyboard only until a guitar is mapped.</p>
      )}

      {mappingActive && (
        <div className={styles.progress}>
          <div>
            {STEPS.map((step, index) => (
              <span
                key={step}
                className={index < captured.length ? styles.done : undefined}
              />
            ))}
          </div>
          <strong>{message}</strong>
        </div>
      )}

      {!mappingActive && message && (
        <p className={styles.message}>{message}</p>
      )}

      <div className={styles.actions}>
        <button type="button" className="button secondary" onClick={beginMapping}>
          {mapping ? 'Remap guitar' : 'Map a guitar'}
        </button>
        {mapping && (
          <button
            type="button"
            className="button ghost"
            onClick={() => onChange(null)}
          >
            Forget mapping
          </button>
        )}
      </div>
    </section>
  )
}
