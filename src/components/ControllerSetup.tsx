import { useEffect, useRef, useState } from 'react'
import { activeGamepadBindings } from '../lib/controllerInput'
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
  const [mappingRequested, setMappingRequested] = useState(false)
  const armed = useRef(false)
  const axisBaseline = useRef<number[]>([])
  const lastAxes = useRef<number[]>([])
  const neutralFrames = useRef(0)
  const baselineReady = useRef(false)
  const mappingActive =
    mappingRequested && captured.length < STEPS.length

  const beginMapping = () => {
    if (!navigator.getGamepads) {
      setMessage(
        'This browser does not support the Gamepad API. Try current Chrome or Edge.',
      )
      return
    }

    try {
      navigator.getGamepads()
    } catch {
      setMessage(
        'The browser blocked controller access. Reload this secure page and try again.',
      )
      return
    }

    setMappingRequested(true)
    setGamepad(null)
    setCaptured([])
    setMessage(
      'Waiting for a controller. Press any fret or move the strum bar now.',
    )
    armed.current = false
    axisBaseline.current = []
    lastAxes.current = []
    neutralFrames.current = 0
    baselineReady.current = false
  }

  const cancelMapping = () => {
    setMappingRequested(false)
    setGamepad(null)
    setCaptured([])
    setMessage('Mapping cancelled.')
    armed.current = false
  }

  useEffect(() => {
    if (!mappingActive || gamepad) return
    let frame = 0
    let found = false

    const connect = (connected: Gamepad) => {
      if (found) return
      found = true
      setGamepad({ id: connected.id, index: connected.index })
      setMessage(
        `Detected ${connected.id || 'gamepad'}. Release every control to calibrate it.`,
      )
      armed.current = false
      baselineReady.current = false
      neutralFrames.current = 0
      lastAxes.current = []
    }

    const poll = () => {
      const connected = [...(navigator.getGamepads?.() ?? [])].find(Boolean)
      if (connected) {
        connect(connected)
        return
      }
      frame = requestAnimationFrame(poll)
    }

    const handleConnected = (event: GamepadEvent) => connect(event.gamepad)
    window.addEventListener('gamepadconnected', handleConnected)
    frame = requestAnimationFrame(poll)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('gamepadconnected', handleConnected)
    }
  }, [gamepad, mappingActive])

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
        setMessage(
          'Controller disconnected. Reconnect it and press any control.',
        )
        setGamepad(null)
        return
      }

      if (!baselineReady.current) {
        const axes = [...current.axes]
        const buttonsReleased = current.buttons.every(
          (button) => !button.pressed,
        )
        const axesStable =
          axes.length === lastAxes.current.length &&
          axes.every(
            (value, index) =>
              Math.abs(value - (lastAxes.current[index] ?? value)) < 0.04,
          )

        lastAxes.current = axes
        neutralFrames.current =
          buttonsReleased && axesStable ? neutralFrames.current + 1 : 0

        if (neutralFrames.current >= 12) {
          axisBaseline.current = axes
          baselineReady.current = true
          armed.current = true
          setMessage(`Press ${STEPS[captured.length]}.`)
        } else {
          setMessage('Controller detected. Release every control to calibrate it.')
        }

        frame = requestAnimationFrame(poll)
        return
      }

      const active = activeGamepadBindings(current, axisBaseline.current)
      if (active.length === 0) {
        armed.current = true
        setMessage(`Press ${STEPS[captured.length]}.`)
      } else if (armed.current) {
        const binding = active[0]
        armed.current = false
        const next = [...captured, binding]
        setCaptured(next)
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
          setMappingRequested(false)
          setGamepad(null)
        }
      }

      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [captured, gamepad, mappingActive, onChange])

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
        <button
          type="button"
          className="button secondary"
          onClick={mappingActive ? cancelMapping : beginMapping}
        >
          {mappingActive
            ? 'Cancel mapping'
            : mapping
              ? 'Remap guitar'
              : 'Map a guitar'}
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
