import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  exclusiveStrumDirections,
  mappedGamepadSnapshot,
} from '../lib/controllerInput'
import {
  directHidSnapshot,
  reconnectDirectHidDevice,
} from '../lib/directHidController'
import { hidBindingActive } from '../lib/hidInput'
import { nextMenuIndex } from '../lib/menuNavigation'
import { useAppState } from '../state/AppState'
import type { ControllerMapping } from '../types/game'

type MenuAction =
  | 'previous'
  | 'next'
  | 'confirm'
  | 'back'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'start'

type MenuInputState = Record<MenuAction, boolean>

const emptyInputState = (): MenuInputState => ({
  previous: false,
  next: false,
  confirm: false,
  back: false,
  yellow: false,
  blue: false,
  orange: false,
  start: false,
})

const focusableSelector = [
  '[data-controller-default]',
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visibleFocusableElements(): HTMLElement[] {
  const focusable = [
    ...document.querySelectorAll<HTMLElement>(focusableSelector),
  ].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest('[hidden], [aria-hidden="true"], [data-controller-ignore]'),
  )
  const navigationItems = focusable.filter((element) =>
    element.hasAttribute('data-controller-nav-item'),
  )
  return navigationItems.length > 0 ? navigationItems : focusable
}

function readInput(mapping: ControllerMapping): MenuInputState {
  if (mapping.source === 'hid') {
    const { reports } = directHidSnapshot(mapping.device)
    const strumDirections = exclusiveStrumDirections(
      hidBindingActive(reports, mapping.strumUp),
      hidBindingActive(reports, mapping.strumDown),
    )
    return {
      previous: strumDirections.up,
      next: strumDirections.down,
      confirm: hidBindingActive(reports, mapping.frets[0]),
      back: hidBindingActive(reports, mapping.frets[1]),
      yellow: hidBindingActive(reports, mapping.frets[2]),
      blue: hidBindingActive(reports, mapping.frets[3]),
      orange: hidBindingActive(reports, mapping.frets[4]),
      start: mapping.start
        ? hidBindingActive(reports, mapping.start)
        : false,
    }
  }

  const gamepads = navigator.getGamepads?.() ?? []
  const snapshot = mappedGamepadSnapshot(mapping, gamepads)
  if (!snapshot) return emptyInputState()

  return {
    previous: snapshot.strumDirections.up,
    next: snapshot.strumDirections.down,
    confirm: snapshot.frets[0],
    back: snapshot.frets[1],
    yellow: snapshot.frets[2],
    blue: snapshot.frets[3],
    orange: snapshot.frets[4],
    start: snapshot.start,
  }
}

function dispatchControllerAction(action: MenuAction): void {
  window.dispatchEvent(
    new CustomEvent('fretline:controller-action', { detail: { action } }),
  )
}

function focusRelative(direction: -1 | 1): void {
  const focusable = visibleFocusableElements()
  if (focusable.length === 0) return

  const activeIndex = focusable.indexOf(
    document.activeElement as HTMLElement,
  )
  const defaultElement = document.querySelector<HTMLElement>(
    '[data-controller-default]',
  )
  const defaultIndex = defaultElement
    ? focusable.indexOf(defaultElement)
    : -1
  const nextIndex = nextMenuIndex(
    focusable.length,
    activeIndex,
    defaultIndex,
    direction,
  )
  const nextElement = focusable[nextIndex]
  nextElement.focus({ preventScroll: true })
  nextElement.scrollIntoView({ block: 'nearest' })
}

function adjustFocusedControl(direction: -1 | 1): boolean {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLInputElement && activeElement.type === 'range') {
    if (direction === 1) {
      activeElement.stepUp()
    } else {
      activeElement.stepDown()
    }
    activeElement.dispatchEvent(new Event('input', { bubbles: true }))
    activeElement.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  if (activeElement instanceof HTMLSelectElement) {
    const nextIndex = Math.max(
      0,
      Math.min(
        activeElement.options.length - 1,
        activeElement.selectedIndex + direction,
      ),
    )
    if (nextIndex === activeElement.selectedIndex) return true
    activeElement.selectedIndex = nextIndex
    activeElement.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  return false
}

function runContextAction(action: 'yellow' | 'blue' | 'orange'): boolean {
  const target = document.querySelector<HTMLElement>(
    `[data-controller-action="${action}"]`,
  )
  if (!target || target.getClientRects().length === 0) return false
  target.focus({ preventScroll: true })
  target.click()
  return true
}

export function MenuControllerNavigation() {
  const { controllerMapping } = useAppState()
  const location = useLocation()
  const navigate = useNavigate()
  const previousRef = useRef<MenuInputState>(emptyInputState())
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
    previousRef.current = emptyInputState()
    repeatAtRef.current = { previous: 0, next: 0 }
  }, [controllerMapping])

  useEffect(() => {
    if (!controllerMapping) return

    let frame = 0

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

    const poll = (now: number) => {
      const current = readInput(controllerMapping)
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
      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [controllerMapping, location.pathname, navigate])

  useEffect(() => {
    if (location.pathname === '/play') return

    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      const editingText =
        active instanceof HTMLInputElement &&
        !['range', 'button', 'checkbox', 'radio'].includes(active.type)

      if (event.key === 'Escape' && location.pathname !== '/') {
        event.preventDefault()
        navigate(-1)
        return
      }
      if (editingText) return
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        focusRelative(event.key === 'ArrowUp' ? -1 : 1)
      } else if (
        event.key === 'Enter' &&
        !(active instanceof HTMLButtonElement) &&
        !(active instanceof HTMLAnchorElement)
      ) {
        const target =
          document.querySelector<HTMLElement>('[data-controller-default]') ??
          visibleFocusableElements()[0]
        target?.click()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate])

  return null
}
