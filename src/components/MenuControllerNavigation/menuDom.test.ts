import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adjustFocusedControl,
  focusRelative,
  visibleFocusableElements,
} from './menuDom'

function makeVisible(element: HTMLElement): void {
  vi.spyOn(element, 'getClientRects').mockReturnValue(
    [{} as DOMRect] as unknown as DOMRectList,
  )
  element.scrollIntoView = vi.fn()
}

describe('controller menu DOM navigation', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('uses explicit navigation items and moves from the selected default', () => {
    document.body.innerHTML = `
      <button data-controller-nav-item data-controller-default>First</button>
      <button data-controller-nav-item>Second</button>
      <button>Ignored while explicit items exist</button>
    `
    const buttons = [...document.querySelectorAll('button')]
    buttons.forEach(makeVisible)

    expect(visibleFocusableElements()).toEqual(buttons.slice(0, 2))

    focusRelative(1)
    expect(document.activeElement).toBe(buttons[1])

    focusRelative(-1)
    expect(document.activeElement).toBe(buttons[0])
  })

  it('keeps controller focus inside an open modal', () => {
    document.body.innerHTML = `
      <button data-controller-nav-item>Background</button>
      <section aria-modal="true">
        <button data-controller-nav-item data-controller-default>Profile</button>
        <button data-controller-nav-item>Guest</button>
      </section>
    `
    const buttons = [...document.querySelectorAll('button')]
    buttons.forEach(makeVisible)
    makeVisible(document.querySelector('section')!)

    expect(visibleFocusableElements()).toEqual(buttons.slice(1))
  })

  it('adjusts a focused range control and emits React-compatible events', () => {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = '10'
    input.step = '1'
    input.value = '4'
    const inputListener = vi.fn()
    const changeListener = vi.fn()
    input.addEventListener('input', inputListener)
    input.addEventListener('change', changeListener)
    document.body.append(input)
    input.focus()

    expect(adjustFocusedControl(1)).toBe(true)
    expect(input.value).toBe('5')
    expect(inputListener).toHaveBeenCalledOnce()
    expect(changeListener).toHaveBeenCalledOnce()
  })
})
