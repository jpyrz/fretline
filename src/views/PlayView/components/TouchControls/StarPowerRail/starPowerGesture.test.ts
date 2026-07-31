import { describe, expect, it } from 'vitest'
import {
  gestureDistance,
  isPowerSwipe,
  projectPowerSwipe,
} from './starPowerGesture'

describe('Star Power rail gesture', () => {
  const upwardRail = { x: 0.25, y: -0.9682458 }

  it('projects movement along the upward rail direction', () => {
    const start = { x: 40, y: 500 }
    const current = {
      x: start.x + upwardRail.x * 50,
      y: start.y + upwardRail.y * 50,
    }

    expect(
      projectPowerSwipe(start, current, upwardRail),
    ).toBeCloseTo(50)
  })

  it('only activates after crossing the upward threshold', () => {
    const start = { x: 40, y: 500 }

    expect(
      isPowerSwipe(start, { x: 50, y: 461 }, upwardRail, 42),
    ).toBe(false)
    expect(
      isPowerSwipe(start, { x: 52, y: 450 }, upwardRail, 42),
    ).toBe(true)
    expect(
      isPowerSwipe(start, { x: 28, y: 550 }, upwardRail, 42),
    ).toBe(false)
  })

  it('measures short taps independently from swipe direction', () => {
    expect(
      gestureDistance({ x: 20, y: 30 }, { x: 26, y: 38 }),
    ).toBe(10)
  })
})
