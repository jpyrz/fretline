import { nextMenuIndex } from '../../lib/menuNavigation'
import type { MenuAction } from './menuInput'

const focusableSelector = [
  '[data-controller-default]',
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function visibleFocusableElements(): HTMLElement[] {
  const focusable = [
    ...document.querySelectorAll<HTMLElement>(focusableSelector),
  ].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest(
        '[hidden], [aria-hidden="true"], [data-controller-ignore]',
      ),
  )
  const navigationItems = focusable.filter((element) =>
    element.hasAttribute('data-controller-nav-item'),
  )
  return navigationItems.length > 0 ? navigationItems : focusable
}

export function dispatchControllerAction(action: MenuAction): void {
  window.dispatchEvent(
    new CustomEvent('fretline:controller-action', { detail: { action } }),
  )
}

export function focusRelative(direction: -1 | 1): void {
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

export function adjustFocusedControl(direction: -1 | 1): boolean {
  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLInputElement &&
    activeElement.type === 'range'
  ) {
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

export function runContextAction(
  action: 'yellow' | 'blue' | 'orange',
): boolean {
  const target = document.querySelector<HTMLElement>(
    `[data-controller-action="${action}"]`,
  )
  if (!target || target.getClientRects().length === 0) return false
  target.focus({ preventScroll: true })
  target.click()
  return true
}
