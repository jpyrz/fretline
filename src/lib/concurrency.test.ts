import { describe, expect, it } from 'vitest'
import { createConcurrencyLimiter, mapConcurrent } from './concurrency'

describe('concurrency utilities', () => {
  it('preserves result order while limiting active tasks', async () => {
    let active = 0
    let peak = 0

    const result = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 2))
      active -= 1
      return value * 10
    })

    expect(result).toEqual([10, 20, 30, 40])
    expect(peak).toBe(2)
  })

  it('releases a slot when a task rejects', async () => {
    const limiter = createConcurrencyLimiter(1)
    await expect(
      limiter.run(() => Promise.reject(new Error('failed'))),
    ).rejects.toThrow('failed')
    await expect(limiter.run(() => Promise.resolve('next'))).resolves.toBe(
      'next',
    )
  })
})
