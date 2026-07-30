export interface ConcurrencyLimiter {
  run: <T>(task: () => Promise<T>) => Promise<T>
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const concurrency = Math.max(1, Math.floor(limit))
  const queue: Array<() => void> = []
  let active = 0

  const release = () => {
    active -= 1
    queue.shift()?.()
  }

  return {
    run: async <T>(task: () => Promise<T>): Promise<T> => {
      if (active >= concurrency) {
        await new Promise<void>((resolve) => queue.push(resolve))
      }
      active += 1
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}

export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limiter = createConcurrencyLimiter(limit)
  return Promise.all(
    items.map((item, index) => limiter.run(() => mapper(item, index))),
  )
}
