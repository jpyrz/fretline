import { useEffect, useRef, useState } from 'react'
import { activeGamepadBindings } from '../lib/controllerInput'
import {
  directHidSnapshot,
  reconnectDirectHidDevice,
  requestDirectHidDevice,
} from '../lib/directHidController'
import { activeHidBindings } from '../lib/hidInput'
import type {
  ControllerMapping,
  GamepadBinding,
  HidBinding,
  HidDeviceIdentity,
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

type CapturedBinding = GamepadBinding | HidBinding
type MappingSource = 'gamepad' | 'hid'

function bindingLabel(binding: CapturedBinding): string {
  if (binding.type === 'button') return `button ${binding.index}`
  if (binding.type === 'axis') {
    return `axis ${binding.index} ${binding.direction > 0 ? '+' : '−'}`
  }
  return `direct input ${binding.reportId}:${binding.byteIndex}`
}

function cloneReports(
  reports: ReadonlyMap<number, Uint8Array>,
): Map<number, Uint8Array> {
  return new Map(
    [...reports].map(([reportId, bytes]) => [
      reportId,
      Uint8Array.from(bytes),
    ]),
  )
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
  const [hidDevice, setHidDevice] = useState<HidDeviceIdentity | null>(null)
  const [captured, setCaptured] = useState<CapturedBinding[]>([])
  const [message, setMessage] = useState('')
  const [mappingSource, setMappingSource] = useState<MappingSource | null>(null)
  const armed = useRef(false)
  const axisBaseline = useRef<number[]>([])
  const hidBaseline = useRef<Map<number, Uint8Array>>(new Map())
  const lastAxes = useRef<number[]>([])
  const lastHidTimestamp = useRef(0)
  const neutralFrames = useRef(0)
  const baselineReady = useRef(false)
  const mappingActive =
    mappingSource !== null && captured.length < STEPS.length

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

    setMappingSource('gamepad')
    setGamepad(null)
    setHidDevice(null)
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

  const beginDirectMapping = async () => {
    setMappingSource('hid')
    setGamepad(null)
    setHidDevice(null)
    setCaptured([])
    setMessage(
      'Choose the guitar or Xbox receiver in the browser device picker.',
    )
    armed.current = false
    hidBaseline.current = new Map()
    lastHidTimestamp.current = 0
    neutralFrames.current = 0
    baselineReady.current = false

    try {
      const selected = await requestDirectHidDevice()
      setHidDevice(selected)
      setMessage(
        `Connected directly to ${selected.productName}. Press and release any control once, then leave everything released.`,
      )
    } catch (reason: unknown) {
      setMappingSource(null)
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Direct controller access could not be opened.',
      )
    }
  }

  const cancelMapping = () => {
    setMappingSource(null)
    setGamepad(null)
    setHidDevice(null)
    setCaptured([])
    setMessage('Mapping cancelled.')
    armed.current = false
  }

  useEffect(() => {
    if (!mappingActive || mappingSource !== 'gamepad' || gamepad) return
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
  }, [gamepad, mappingActive, mappingSource])

  useEffect(() => {
    if (!mappingActive || mappingSource !== 'gamepad' || !gamepad) return
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
          const bindings = next as [
            GamepadBinding,
            GamepadBinding,
            GamepadBinding,
            GamepadBinding,
            GamepadBinding,
            GamepadBinding,
            GamepadBinding,
          ]
          onChange({
            source: 'gamepad',
            gamepadId: current.id,
            gamepadIndex: current.index,
            frets: [
              bindings[0],
              bindings[1],
              bindings[2],
              bindings[3],
              bindings[4],
            ],
            strumUp: bindings[5],
            strumDown: bindings[6],
          })
          setMessage('Mapping saved locally.')
          setMappingSource(null)
          setGamepad(null)
        }
      }

      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [captured, gamepad, mappingActive, mappingSource, onChange])

  useEffect(() => {
    if (mapping?.source !== 'hid') return
    void reconnectDirectHidDevice(mapping.device)
  }, [mapping])

  useEffect(() => {
    if (!mappingActive || mappingSource !== 'hid' || !hidDevice) return
    let frame = 0

    const poll = () => {
      const snapshot = directHidSnapshot(hidDevice)

      if (snapshot.reports.size === 0) {
        setMessage(
          `Direct access to ${hidDevice.productName} is open. Press and release any fret once so it sends an input report.`,
        )
        frame = requestAnimationFrame(poll)
        return
      }

      if (!baselineReady.current) {
        if (snapshot.timestamp !== lastHidTimestamp.current) {
          lastHidTimestamp.current = snapshot.timestamp
          neutralFrames.current = 0
        } else {
          neutralFrames.current += 1
        }

        if (
          neutralFrames.current >= 12 &&
          performance.now() - snapshot.timestamp >= 180
        ) {
          hidBaseline.current = cloneReports(snapshot.reports)
          baselineReady.current = true
          armed.current = true
          setMessage(`Press ${STEPS[captured.length]}.`)
        } else {
          setMessage(
            'Direct input detected. Release every control to calibrate it.',
          )
        }

        frame = requestAnimationFrame(poll)
        return
      }

      const active = activeHidBindings(
        snapshot.reports,
        hidBaseline.current,
      )
      if (active.length === 0) {
        armed.current = true
        setMessage(`Press ${STEPS[captured.length]}.`)
      } else if (armed.current) {
        const binding = active[0]
        armed.current = false
        const next = [...captured, binding]
        setCaptured(next)

        if (next.length === STEPS.length) {
          const bindings = next as [
            HidBinding,
            HidBinding,
            HidBinding,
            HidBinding,
            HidBinding,
            HidBinding,
            HidBinding,
          ]
          onChange({
            source: 'hid',
            device: hidDevice,
            frets: [
              bindings[0],
              bindings[1],
              bindings[2],
              bindings[3],
              bindings[4],
            ],
            strumUp: bindings[5],
            strumDown: bindings[6],
          })
          setMessage('Direct controller mapping saved locally.')
          setMappingSource(null)
          setHidDevice(null)
        }
      }

      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [
    captured,
    hidDevice,
    mappingActive,
    mappingSource,
    onChange,
  ])

  return (
    <section className={styles.panel} aria-labelledby="controller-title">
      <div>
        <p className={styles.eyebrow}>Input device</p>
        <h2 id="controller-title">Guitar controller</h2>
        <p className={styles.description}>
          Map any controller the browser exposes as a gamepad. If an older
          guitar is invisible, Chrome and Edge can try a direct USB connection.
        </p>
      </div>

      {mapping ? (
        <div className={styles.connected}>
          <span className={styles.statusDot} />
          <div>
            <strong>
              {mapping.source === 'hid'
                ? mapping.device.productName
                : mapping.gamepadId}
            </strong>
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
        {!mappingActive && (
          <button
            type="button"
            className="button ghost"
            onClick={() => void beginDirectMapping()}
          >
            Try direct USB controller
          </button>
        )}
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
