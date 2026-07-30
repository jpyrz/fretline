import { describe, expect, it } from 'vitest'
import { recommendedInputMode } from './inputMode'

describe('recommended input mode', () => {
  it('defaults touch-only devices to tap mode', () => {
    expect(
      recommendedInputMode(undefined, {
        touchAvailable: true,
        controllerConfigured: false,
      }),
    ).toBe('tap')
  })

  it('keeps configured controllers on standard mode', () => {
    expect(
      recommendedInputMode(undefined, {
        touchAvailable: true,
        controllerConfigured: true,
      }),
    ).toBe('standard')
  })

  it('remembers an explicit player selection', () => {
    expect(
      recommendedInputMode('standard', {
        touchAvailable: true,
        controllerConfigured: false,
      }),
    ).toBe('standard')
    expect(
      recommendedInputMode('tap', {
        touchAvailable: false,
        controllerConfigured: true,
      }),
    ).toBe('tap')
  })
})
