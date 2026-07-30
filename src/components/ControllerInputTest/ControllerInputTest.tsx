import { useEffect, useRef, useState } from 'react'
import {
  describeGamepadBinding,
  exclusiveStrumDirections,
  mappedGamepadSnapshot,
} from '../../lib/controllerInput'
import { directHidSnapshot } from '../../lib/directHidController'
import { hidAnalogValue, hidBindingActive } from '../../lib/hidInput'
import type { ControllerMapping } from '../../types/game'
import styles from './ControllerInputTest.module.scss'

interface LiveInputState {
  connected: boolean
  source: string
  up: boolean
  down: boolean
  starPower: boolean
  whammy: number
  start: boolean
  pressedButtons: string
  axes: string
}

const disconnectedState: LiveInputState = {
  connected: false,
  source: 'Waiting for controller',
  up: false,
  down: false,
  starPower: false,
  whammy: 0,
  start: false,
  pressedButtons: 'none',
  axes: 'unavailable',
}

function sameLiveInput(
  left: LiveInputState,
  right: LiveInputState,
): boolean {
  return (
    left.connected === right.connected &&
    left.source === right.source &&
    left.up === right.up &&
    left.down === right.down &&
    left.starPower === right.starPower &&
    Math.round(left.whammy * 100) === Math.round(right.whammy * 100) &&
    left.start === right.start &&
    left.pressedButtons === right.pressedButtons &&
    left.axes === right.axes
  )
}

function readLiveInput(mapping: ControllerMapping): LiveInputState {
  if (mapping.source === 'hid') {
    const { reports } = directHidSnapshot(mapping.device)
    const directions = exclusiveStrumDirections(
      hidBindingActive(reports, mapping.strumUp),
      hidBindingActive(reports, mapping.strumDown),
    )
    const reportText = [...reports]
      .map(
        ([reportId, bytes]) =>
          `${reportId}: ${[...bytes]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ')}`,
      )
      .join(' | ')

    return {
      connected: reports.size > 0,
      source: `Direct HID · ${mapping.device.productName}`,
      up: directions.up,
      down: directions.down,
      starPower: mapping.starPower
        ? hidBindingActive(reports, mapping.starPower)
        : false,
      whammy: hidAnalogValue(reports, mapping.whammy),
      start: mapping.start
        ? hidBindingActive(reports, mapping.start)
        : false,
      pressedButtons: 'Direct HID reports',
      axes: reportText || 'No reports received',
    }
  }

  const gamepads = navigator.getGamepads?.() ?? []
  const snapshot = mappedGamepadSnapshot(mapping, gamepads)
  if (!snapshot) return disconnectedState
  const { gamepad } = snapshot
  const pressedButtons = [...gamepad.buttons]
    .flatMap((button, index) => (button.pressed ? [index] : []))
    .join(', ')
  const axes = [...gamepad.axes]
    .map((value, index) => `${index}: ${value.toFixed(3)}`)
    .join(' · ')

  return {
    connected: true,
    source: `${gamepad.mapping || 'raw'} mapping · index ${gamepad.index}`,
    up: snapshot.strumDirections.up,
    down: snapshot.strumDirections.down,
    starPower: snapshot.starPower,
    whammy: snapshot.whammy,
    start: snapshot.start,
    pressedButtons: pressedButtons || 'none',
    axes: axes || 'none',
  }
}

export function ControllerInputTest({
  mapping,
}: {
  mapping: ControllerMapping
}) {
  const [liveInput, setLiveInput] =
    useState<LiveInputState>(disconnectedState)
  const liveInputRef = useRef(liveInput)

  useEffect(() => {
    const update = () => {
      const nextInput = readLiveInput(mapping)
      if (sameLiveInput(liveInputRef.current, nextInput)) return
      liveInputRef.current = nextInput
      setLiveInput(nextInput)
    }
    update()
    const interval = window.setInterval(update, 80)
    return () => window.clearInterval(interval)
  }, [mapping])

  return (
    <section className={styles.test} aria-labelledby="controller-test-title">
      <div className={styles.heading}>
        <div>
          <p>Live input test</p>
          <strong id="controller-test-title">
            Hold each strum direction
          </strong>
        </div>
        <span data-connected={liveInput.connected}>
          {liveInput.connected ? 'Receiving input' : 'Disconnected'}
        </span>
      </div>

      <div className={styles.indicators}>
        <b data-active={liveInput.up}>Strum up</b>
        <b data-active={liveInput.down}>Strum down</b>
        <b data-active={liveInput.starPower}>Star power</b>
        <b data-active={liveInput.whammy >= 0.08}>
          Whammy {Math.round(liveInput.whammy * 100)}%
        </b>
        <b data-active={liveInput.start}>Start</b>
      </div>

      <dl>
        <div>
          <dt>Input source</dt>
          <dd>{liveInput.source}</dd>
        </div>
        {mapping.source !== 'hid' && (
          <>
            <div>
              <dt>Saved strum up</dt>
              <dd>{describeGamepadBinding(mapping.strumUp, 3)}</dd>
            </div>
            <div>
              <dt>Saved strum down</dt>
              <dd>{describeGamepadBinding(mapping.strumDown, 3)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Pressed buttons</dt>
          <dd>{liveInput.pressedButtons}</dd>
        </div>
        <div>
          <dt>Raw axes / reports</dt>
          <dd>{liveInput.axes}</dd>
        </div>
      </dl>
    </section>
  )
}
