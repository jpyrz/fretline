import { useEffect, useState } from 'react'
import { mappedGamepadSnapshot } from '../lib/controllerInput'
import { directHidSnapshot } from '../lib/directHidController'
import type { ControllerMapping } from '../types/game'

export function controllerIsConnected(
  mapping: ControllerMapping | null,
): boolean {
  if (!mapping) return false
  if (mapping.source === 'hid') {
    return directHidSnapshot(mapping.device).connected
  }
  return Boolean(
    mappedGamepadSnapshot(
      mapping,
      navigator.getGamepads?.() ?? [],
    ),
  )
}

export function useControllerConnection(
  mapping: ControllerMapping | null,
): boolean {
  const [connected, setConnected] = useState(() =>
    controllerIsConnected(mapping),
  )

  useEffect(() => {
    const update = () => setConnected(controllerIsConnected(mapping))
    update()
    const interval = window.setInterval(update, 500)
    window.addEventListener('gamepadconnected', update)
    window.addEventListener('gamepaddisconnected', update)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('gamepadconnected', update)
      window.removeEventListener('gamepaddisconnected', update)
    }
  }, [mapping])

  return connected
}
