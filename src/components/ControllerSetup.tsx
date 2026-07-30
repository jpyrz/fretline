import { useEffect, useRef, useState } from 'react'
import {
  activeGamepadBindings,
  describeGamepadBinding,
} from '../lib/controllerInput'
import {
  directHidSnapshot,
  reconnectDirectHidDevice,
  requestDirectHidDevice,
} from '../lib/directHidController'
import {
  activeHidBindings,
  changedHidBytes,
  hidByteKey,
} from '../lib/hidInput'
import type {
  ControllerMapping,
  GamepadBinding,
  HidAnalogBinding,
  HidBinding,
  HidDeviceIdentity,
} from '../types/game'
import styles from './ControllerSetup.module.scss'
import { ControllerInputTest } from './ControllerInputTest'

const STEPS = [
  'Green fret',
  'Red fret',
  'Yellow fret',
  'Blue fret',
  'Orange fret',
  'Strum up',
  'Strum down',
  'Star power / select',
  'Whammy bar',
  'Start / pause',
]

const STRUM_UP_STEP = 5
const STRUM_DOWN_STEP = 6
const STAR_POWER_STEP = 7
const WHAMMY_STEP = 8
const START_STEP = 9
const HID_MOTION_CALIBRATION_MS = 2500
const HID_SETTLE_MS = 350
const HID_CAPTURE_HOLD_MS = 35

type CapturedBinding = GamepadBinding | HidBinding | HidAnalogBinding
type MappingSource = 'gamepad' | 'hid'

function bindingLabel(binding: CapturedBinding): string {
  if (binding.type === 'button' || binding.type === 'axis') {
    return describeGamepadBinding(binding)
  }
  if (binding.type === 'hid-axis') {
    return `direct axis ${binding.reportId}:${binding.byteIndex}`
  }
  return `direct input ${binding.reportId}:${binding.byteIndex}`
}

function sameBinding(
  left: CapturedBinding,
  right: CapturedBinding,
): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'button' && right.type === 'button') {
    return left.index === right.index
  }
  if (left.type === 'axis' && right.type === 'axis') {
    if (left.index !== right.index) return false
    if (left.value !== undefined && right.value !== undefined) {
      return Math.abs(left.value - right.value) < 0.08
    }
    return left.direction === right.direction
  }
  if (left.type === 'hid' && right.type === 'hid') {
    return (
      left.reportId === right.reportId &&
      left.byteIndex === right.byteIndex &&
      left.mask === right.mask &&
      left.activeValue === right.activeValue
    )
  }
  if (left.type === 'hid-axis' && right.type === 'hid-axis') {
    return (
      left.reportId === right.reportId &&
      left.byteIndex === right.byteIndex
    )
  }
  return false
}

function mappingPrompt(step: number, direct = false): string {
  if (step === WHAMMY_STEP) {
    return direct
      ? `Move ${STEPS[step]} fully and briefly hold it.`
      : `Move ${STEPS[step]} fully.`
  }
  return direct
    ? `Press and briefly hold ${STEPS[step]}.`
    : `Press ${STEPS[step]}.`
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
  const hidMotionReference = useRef<Map<number, Uint8Array>>(new Map())
  const ignoredHidBytes = useRef<Set<string>>(new Set())
  const lastAxes = useRef<number[]>([])
  const lastHidTimestamp = useRef(0)
  const hidMotionCalibrationStartedAt = useRef(0)
  const pendingHidBinding = useRef<{
    key: string
    startedAt: number
  } | null>(null)
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
    hidMotionReference.current = new Map()
    ignoredHidBytes.current = new Set()
    lastHidTimestamp.current = 0
    hidMotionCalibrationStartedAt.current = 0
    pendingHidBinding.current = null
    neutralFrames.current = 0
    baselineReady.current = false

    try {
      const selected = await requestDirectHidDevice()
      setHidDevice(selected)
      setMessage(
        `Connected directly to ${selected.productName}. Press and release any control once, then hold the guitar still.`,
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
          setMessage(mappingPrompt(captured.length))
        } else {
          setMessage('Controller detected. Release every control to calibrate it.')
        }

        frame = requestAnimationFrame(poll)
        return
      }

      const active = activeGamepadBindings(current, axisBaseline.current)
      if (active.length === 0) {
        armed.current = true
        setMessage(mappingPrompt(captured.length))
      } else if (armed.current) {
        const binding = active[0]
        armed.current = false
        if (
          captured.length === STRUM_DOWN_STEP &&
          sameBinding(binding, captured[STRUM_UP_STEP])
        ) {
          setMessage(
            'Strum down matched strum up. Release the bar, then press it in the opposite direction.',
          )
          frame = requestAnimationFrame(poll)
          return
        }
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
            starPower: bindings[STAR_POWER_STEP],
            whammy: bindings[WHAMMY_STEP],
            start: bindings[START_STEP],
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
        const now = performance.now()

        if (hidMotionCalibrationStartedAt.current === 0) {
          lastHidTimestamp.current = snapshot.timestamp

          if (now - snapshot.timestamp >= HID_SETTLE_MS) {
            hidMotionReference.current = cloneReports(snapshot.reports)
            ignoredHidBytes.current = new Set()
            hidMotionCalibrationStartedAt.current = now
            setMessage(
              'Now gently tilt and move the guitar for 3 seconds. Do not press frets or strum.',
            )
          } else {
            setMessage(
              'Release every control and hold the guitar still for a moment.',
            )
          }

          frame = requestAnimationFrame(poll)
          return
        }

        if (snapshot.timestamp !== lastHidTimestamp.current) {
          lastHidTimestamp.current = snapshot.timestamp
          changedHidBytes(
            snapshot.reports,
            hidMotionReference.current,
          ).forEach((key) => ignoredHidBytes.current.add(key))
        }

        const calibrationElapsed =
          now - hidMotionCalibrationStartedAt.current
        if (calibrationElapsed < HID_MOTION_CALIBRATION_MS) {
          const seconds = Math.max(
            1,
            Math.ceil(
              (HID_MOTION_CALIBRATION_MS - calibrationElapsed) / 1000,
            ),
          )
          setMessage(
            `Gently tilt and move the guitar—no buttons or strumming. ${seconds}s`,
          )
        } else if (
          now - snapshot.timestamp >= HID_SETTLE_MS ||
          calibrationElapsed >= HID_MOTION_CALIBRATION_MS + 2500
        ) {
          hidBaseline.current = cloneReports(snapshot.reports)
          baselineReady.current = true
          armed.current = true
          pendingHidBinding.current = null
          setMessage(mappingPrompt(captured.length, true))
        } else {
          setMessage(
            'Motion learned. Hold the guitar still to finish calibration.',
          )
        }

        frame = requestAnimationFrame(poll)
        return
      }

      const active = activeHidBindings(
        snapshot.reports,
        hidBaseline.current,
        ignoredHidBytes.current,
      )
      if (active.length === 0) {
        armed.current = true
        pendingHidBinding.current = null
        setMessage(mappingPrompt(captured.length, true))
      } else if (armed.current) {
        const binding = active[0]
        const bindingKey = `${hidByteKey(
          binding.reportId,
          binding.byteIndex,
        )}:${binding.mask}:${binding.activeValue}`
        const pending = pendingHidBinding.current

        if (!pending || pending.key !== bindingKey) {
          pendingHidBinding.current = {
            key: bindingKey,
            startedAt: performance.now(),
          }
          setMessage(`Keep holding ${STEPS[captured.length]}…`)
          frame = requestAnimationFrame(poll)
          return
        }

        if (performance.now() - pending.startedAt < HID_CAPTURE_HOLD_MS) {
          frame = requestAnimationFrame(poll)
          return
        }

        armed.current = false
        pendingHidBinding.current = null
        if (
          captured.length === STRUM_DOWN_STEP &&
          sameBinding(binding, captured[STRUM_UP_STEP])
        ) {
          setMessage(
            'Strum down matched strum up. Release the bar, then press it in the opposite direction.',
          )
          frame = requestAnimationFrame(poll)
          return
        }
        const capturedBinding: CapturedBinding =
          captured.length === WHAMMY_STEP
            ? {
                type: 'hid-axis',
                reportId: binding.reportId,
                byteIndex: binding.byteIndex,
                rest:
                  hidBaseline.current.get(binding.reportId)?.[
                    binding.byteIndex
                  ] ?? 0,
                value:
                  snapshot.reports.get(binding.reportId)?.[
                    binding.byteIndex
                  ] ?? binding.activeValue,
              }
            : binding
        const next = [...captured, capturedBinding]
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
            HidBinding,
            HidAnalogBinding,
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
            starPower: bindings[STAR_POWER_STEP],
            whammy: bindings[WHAMMY_STEP],
            start: bindings[START_STEP],
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
    <section
      className={styles.panel}
      aria-labelledby="controller-title"
      data-controller-capturing={mappingActive}
    >
      <div>
        <p className={styles.eyebrow}>Input device</p>
        <h2 id="controller-title">Guitar controller</h2>
        <p className={styles.description}>
          Map any controller the browser exposes as a gamepad. If an older
          guitar is invisible, Chrome and Edge can try a direct USB connection.
        </p>
      </div>

      {mapping ? (
        <>
          <div className={styles.connected}>
            <span className={styles.statusDot} />
            <div>
              <strong>
                {mapping.source === 'hid'
                  ? mapping.device.productName
                  : mapping.gamepadId}
              </strong>
              <small>
                Green is {bindingLabel(mapping.frets[0])}; strum up is{' '}
                {bindingLabel(mapping.strumUp)}; down is{' '}
                {bindingLabel(mapping.strumDown)}; Start is{' '}
                {mapping.start
                  ? bindingLabel(mapping.start)
                  : mapping.source === 'hid'
                    ? 'not mapped—remap to enable pause'
                    : 'standard Start or remap'}
                ; Star power is{' '}
                {mapping.starPower
                  ? bindingLabel(mapping.starPower)
                  : mapping.source === 'hid'
                    ? 'not mapped—remap to enable it'
                    : 'standard Select or remap'}
                ; Whammy is{' '}
                {mapping.whammy
                  ? bindingLabel(mapping.whammy)
                  : 'not mapped—remap to enable it'}
              </small>
            </div>
          </div>
          {!mappingActive && <ControllerInputTest mapping={mapping} />}
        </>
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
