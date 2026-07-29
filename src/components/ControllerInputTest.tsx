import { useEffect, useState } from 'react'
import {
  exclusiveStrumDirections,
  gamepadStartActive,
  gamepadStrumDirections,
} from '../lib/controllerInput'
import { directHidSnapshot } from '../lib/directHidController'
import { hidBindingActive } from '../lib/hidInput'
import type { ControllerMapping, GamepadBinding } from '../types/game'
import styles from './ControllerInputTest.module.scss'

interface LiveInputState {
  connected: boolean
  source: string
  up: boolean
  down: boolean
  start: boolean
  pressedButtons: string
  axes: string
}

const disconnectedState: LiveInputState = {
  connected: false,
  source: 'Waiting for controller',
  up: false,
  down: false,
  start: false,
  pressedButtons: 'none',
  axes: 'unavailable',
}

function bindingDescription(binding: GamepadBinding): string {
  if (binding.type === 'button') return `button ${binding.index}`
  const target =
    binding.value === undefined ? '' : ` · target ${binding.value.toFixed(3)}`
  const rest =
    binding.rest === undefined ? '' : ` · rest ${binding.rest.toFixed(3)}`
  return `axis ${binding.index} · ${binding.direction > 0 ? '+' : '−'}${target}${rest}`
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
      start: mapping.start
        ? hidBindingActive(reports, mapping.start)
        : false,
      pressedButtons: 'Direct HID reports',
      axes: reportText || 'No reports received',
    }
  }

  const gamepads = navigator.getGamepads?.() ?? []
  const indexedGamepad = gamepads[mapping.gamepadIndex]
  const gamepad =
    indexedGamepad?.id === mapping.gamepadId
      ? indexedGamepad
      : [...gamepads].find(
          (candidate) => candidate?.id === mapping.gamepadId,
        )
  if (!gamepad) return disconnectedState

  const directions = gamepadStrumDirections(
    gamepad,
    mapping.strumUp,
    mapping.strumDown,
  )
  const pressedButtons = [...gamepad.buttons]
    .flatMap((button, index) => (button.pressed ? [index] : []))
    .join(', ')
  const axes = [...gamepad.axes]
    .map((value, index) => `${index}: ${value.toFixed(3)}`)
    .join(' · ')

  return {
    connected: true,
    source: `${gamepad.mapping || 'raw'} mapping · index ${gamepad.index}`,
    up: directions.up,
    down: directions.down,
    start: gamepadStartActive(gamepad, mapping.start),
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

  useEffect(() => {
    const update = () => setLiveInput(readLiveInput(mapping))
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
              <dd>{bindingDescription(mapping.strumUp)}</dd>
            </div>
            <div>
              <dt>Saved strum down</dt>
              <dd>{bindingDescription(mapping.strumDown)}</dd>
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
