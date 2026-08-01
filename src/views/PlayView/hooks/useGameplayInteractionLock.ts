import { useEffect, useEffectEvent, useRef } from 'react'

const BLOCKED_DOCUMENT_EVENTS = [
  'contextmenu',
  'dragstart',
  'gesturestart',
  'gesturechange',
  'gestureend',
] as const

function preventBrowserInteraction(event: Event): void {
  event.preventDefault()
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
}

function preventGameplayTouchDefaults(event: TouchEvent): void {
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('[data-gameplay-touch-surface]')
  ) {
    event.preventDefault()
  }
}

/**
 * Makes an active run behave like a game surface instead of a document.
 * The duplicate history entry absorbs a browser back gesture without changing
 * routes; consuming it pauses the run so the player can choose whether to
 * leave. The entry is removed again whenever gameplay ends normally.
 */
export function useGameplayInteractionLock(
  active: boolean,
  onBackAttempt: () => void,
): void {
  const guardActiveRef = useRef(false)
  const onBackAttemptEvent = useEffectEvent(onBackAttempt)

  useEffect(() => {
    if (active || !guardActiveRef.current) return
    guardActiveRef.current = false
    window.history.back()
  }, [active])

  useEffect(() => {
    if (!active) return

    document.documentElement.dataset.gameplayActive = 'true'
    clearSelection()

    if (!guardActiveRef.current) {
      window.history.pushState(
        window.history.state,
        '',
        window.location.href,
      )
      guardActiveRef.current = true
    }

    const handleBackNavigation = () => {
      if (!guardActiveRef.current) return
      guardActiveRef.current = false
      onBackAttemptEvent()
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    for (const eventName of BLOCKED_DOCUMENT_EVENTS) {
      document.addEventListener(eventName, preventBrowserInteraction, {
        capture: true,
        passive: false,
      })
    }
    document.addEventListener('selectstart', preventBrowserInteraction, true)
    document.addEventListener('selectionchange', clearSelection)
    document.addEventListener('touchstart', preventGameplayTouchDefaults, {
      capture: true,
      passive: false,
    })
    document.addEventListener('touchmove', preventGameplayTouchDefaults, {
      capture: true,
      passive: false,
    })
    window.addEventListener('popstate', handleBackNavigation)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      delete document.documentElement.dataset.gameplayActive
      clearSelection()
      for (const eventName of BLOCKED_DOCUMENT_EVENTS) {
        document.removeEventListener(eventName, preventBrowserInteraction, true)
      }
      document.removeEventListener(
        'selectstart',
        preventBrowserInteraction,
        true,
      )
      document.removeEventListener('selectionchange', clearSelection)
      document.removeEventListener(
        'touchstart',
        preventGameplayTouchDefaults,
        true,
      )
      document.removeEventListener(
        'touchmove',
        preventGameplayTouchDefaults,
        true,
      )
      window.removeEventListener('popstate', handleBackNavigation)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [active])
}
