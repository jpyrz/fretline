import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { reconnectDirectHidDevice } from '../../lib/directHidController'
import { keyboardEventCode } from '../../lib/keyboardMapping'
import { useAppState } from '../../state/AppState'
import {
  adjustFocusedControl,
  dispatchControllerAction,
  focusRelative,
  runContextAction,
  visibleFocusableElements,
} from './menuDom'
import {
  emptyMenuInputState,
  readMenuInput,
  type MenuAction,
  type MenuInputState,
} from './menuInput'

export function MenuControllerNavigation() {
  const { controllerMapping, keyboardMapping } = useAppState()
  const location = useLocation()
  const navigate = useNavigate()
  const previousRef = useRef<MenuInputState>(emptyMenuInputState())
  const repeatAtRef = useRef({ previous: 0, next: 0 })

  useEffect(() => {
    if (controllerMapping?.source !== 'hid') return
    void reconnectDirectHidDevice(controllerMapping.device)
  }, [controllerMapping])

  useEffect(() => {
    const clearControllerMode = () => {
      delete document.documentElement.dataset.controllerInput
    }
    window.addEventListener('pointerdown', clearControllerMode)
    window.addEventListener('keydown', clearControllerMode)
    return () => {
      window.removeEventListener('pointerdown', clearControllerMode)
      window.removeEventListener('keydown', clearControllerMode)
    }
  }, [])

  useEffect(() => {
    previousRef.current = emptyMenuInputState()
    repeatAtRef.current = { previous: 0, next: 0 }
  }, [controllerMapping])

  useEffect(() => {
    if (!controllerMapping) return

    const perform = (action: MenuAction) => {
      if (document.querySelector('[data-controller-capturing="true"]')) return
      const gameplayActive = Boolean(
        document.querySelector('[data-controller-gameplay="true"]'),
      )
      if (gameplayActive && action !== 'start') return
      document.documentElement.dataset.controllerInput = 'true'
      dispatchControllerAction(action)

      if (action === 'start') return

      if (action === 'previous' || action === 'next') {
        focusRelative(action === 'previous' ? -1 : 1)
        return
      }

      if (action === 'confirm') {
        const focusable = visibleFocusableElements()
        const active =
          document.activeElement instanceof HTMLElement &&
          focusable.includes(document.activeElement)
            ? document.activeElement
            : document.querySelector<HTMLElement>('[data-controller-default]') ??
              focusable[0]
        active?.focus({ preventScroll: true })
        const controllerTarget = active?.dataset.controllerActivate
        const target = controllerTarget
          ? document.querySelector<HTMLElement>(
              `[data-controller-target="${controllerTarget}"]`,
            )
          : null
        ;(target ?? active)?.click()
        return
      }

      if (action === 'back') {
        const backTarget = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-controller-back]',
          ),
        ].find((target) => target.getClientRects().length > 0)
        if (backTarget) {
          backTarget.click()
        } else if (location.pathname !== '/') {
          navigate(-1)
        }
        return
      }

      if (runContextAction(action)) return
      if (action === 'yellow') adjustFocusedControl(-1)
      if (action === 'blue') adjustFocusedControl(1)
    }

    const poll = () => {
      if (document.hidden) return
      const now = performance.now()
      const current = readMenuInput(controllerMapping)
      const previous = previousRef.current

      for (const action of ['previous', 'next'] as const) {
        if (!current[action]) {
          repeatAtRef.current[action] = 0
          continue
        }
        if (!previous[action]) {
          perform(action)
          repeatAtRef.current[action] = now + 380
        } else if (now >= repeatAtRef.current[action]) {
          perform(action)
          repeatAtRef.current[action] = now + 115
        }
      }

      for (const action of [
        'confirm',
        'back',
        'yellow',
        'blue',
        'orange',
        'start',
      ] as const) {
        if (current[action] && !previous[action]) perform(action)
      }

      previousRef.current = current
    }

    poll()
    const interval = window.setInterval(poll, 32)
    return () => window.clearInterval(interval)
  }, [controllerMapping, location.pathname, navigate])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-controller-capturing="true"]')) return
      if (document.querySelector('[data-controller-gameplay="true"]')) return
      const active = document.activeElement
      const editingText =
        active instanceof HTMLInputElement &&
        !['range', 'button', 'checkbox', 'radio'].includes(active.type)
      const code = keyboardEventCode(event)
      if (
        location.pathname === '/play' &&
        code === keyboardMapping.pause
      ) {
        return
      }

      if (
        code === keyboardMapping.back &&
        location.pathname !== '/' &&
        !event.repeat
      ) {
        event.preventDefault()
        const backTarget = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-controller-back]',
          ),
        ].find((target) => target.getClientRects().length > 0)
        if (backTarget) {
          backTarget.click()
        } else {
          navigate(-1)
        }
        return
      }
      if (editingText) return
      if (
        code === keyboardMapping.strumUp ||
        code === keyboardMapping.strumDown
      ) {
        event.preventDefault()
        focusRelative(code === keyboardMapping.strumUp ? -1 : 1)
      } else if (code === keyboardMapping.select && !event.repeat) {
        event.preventDefault()
        const focusable = visibleFocusableElements()
        const target =
          active instanceof HTMLElement && focusable.includes(active)
            ? active
            : document.querySelector<HTMLElement>(
                '[data-controller-default]',
              ) ?? focusable[0]
        target?.focus({ preventScroll: true })
        target?.click()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardMapping, location.pathname, navigate])

  return null
}
