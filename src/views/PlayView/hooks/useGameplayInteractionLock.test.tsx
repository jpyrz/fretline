import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGameplayInteractionLock } from './useGameplayInteractionLock'

afterEach(() => {
  delete document.documentElement.dataset.gameplayActive
  vi.restoreAllMocks()
})

describe('useGameplayInteractionLock', () => {
  it('blocks document interactions and turns back navigation into a callback', () => {
    const onBackAttempt = vi.fn()
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => undefined)

    const { unmount } = renderHook(() =>
      useGameplayInteractionLock(true, onBackAttempt),
    )

    expect(document.documentElement.dataset.gameplayActive).toBe('true')
    expect(pushState).toHaveBeenCalledOnce()

    const selection = new Event('selectstart', {
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(selection)
    expect(selection.defaultPrevented).toBe(true)

    const surface = document.createElement('div')
    surface.dataset.gameplayTouchSurface = 'true'
    document.body.append(surface)
    const touchStart = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    })
    surface.dispatchEvent(touchStart)
    expect(touchStart.defaultPrevented).toBe(true)
    surface.remove()

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onBackAttempt).toHaveBeenCalledOnce()

    unmount()
    expect(document.documentElement.dataset.gameplayActive).toBeUndefined()
  })

  it('balances the guard entry when gameplay ends normally', () => {
    const back = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => undefined)
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined)

    const { rerender, unmount } = renderHook(
      ({ active }) =>
        useGameplayInteractionLock(active, () => undefined),
      { initialProps: { active: true } },
    )

    rerender({ active: false })
    expect(back).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.gameplayActive).toBeUndefined()
    unmount()
  })
})
