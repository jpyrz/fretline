export type PlayInputMode = 'standard' | 'tap'

export interface InputModeEnvironment {
  touchAvailable: boolean
  controllerConfigured: boolean
}

export function touchInputAvailable(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.maxTouchPoints > 0) return true
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

export function recommendedInputMode(
  storedMode: unknown,
  environment: InputModeEnvironment,
): PlayInputMode {
  if (storedMode === 'standard' || storedMode === 'tap') {
    return storedMode
  }
  if (environment.controllerConfigured) return 'standard'
  return environment.touchAvailable ? 'tap' : 'standard'
}
