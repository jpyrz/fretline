import { describe, expect, it } from 'vitest'
import {
  HANDITAP_SWEEP_MEMORY_SECONDS,
  TapSweepBuffer,
} from './tapSweepBuffer'

describe('TapSweepBuffer', () => {
  it('consumes crossed lanes in gesture order', () => {
    const buffer = new TapSweepBuffer()
    buffer.record(1, 1, 1)
    buffer.record(1, 2, 1.02)
    buffer.record(1, 3, 1.04)

    expect(buffer.consume(2, 1.08)).toBe(true)
    expect(buffer.has(1, 1.08)).toBe(false)
    expect(buffer.consume(3, 1.08)).toBe(true)
  })

  it('does not reuse lanes that were skipped earlier in the path', () => {
    const buffer = new TapSweepBuffer()
    buffer.record(1, 1, 1)
    buffer.record(1, 2, 1.02)
    buffer.record(1, 3, 1.04)

    expect(buffer.consume(3, 1.08)).toBe(true)
    expect(buffer.consume(2, 1.08)).toBe(false)
  })

  it('keeps simultaneous thumb paths independent', () => {
    const buffer = new TapSweepBuffer()
    buffer.record(1, 0, 1)
    buffer.record(1, 1, 1.02)
    buffer.record(2, 4, 1.01)

    expect(buffer.consume(1, 1.05)).toBe(true)
    expect(buffer.consume(4, 1.05)).toBe(true)
  })

  it('expires old crossings and clears a released pointer', () => {
    const buffer = new TapSweepBuffer()
    buffer.record(1, 2, 1)
    expect(
      buffer.has(2, 1 + HANDITAP_SWEEP_MEMORY_SECONDS + 0.001),
    ).toBe(false)

    buffer.record(2, 3, 2)
    buffer.release(2)
    expect(buffer.has(3, 2)).toBe(false)
  })
})
