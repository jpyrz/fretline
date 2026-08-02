import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HIT_LINE_RATIO } from '../../../../../game/rendering/highwayGeometry'
import { StarPowerRail } from './StarPowerRail'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StarPowerRail', () => {
  it('renders a passive status meter for Standard Mode', () => {
    render(
      <StarPowerRail
        highwayLength={55}
        hitLineRatio={DEFAULT_HIT_LINE_RATIO}
        active={false}
        charge={0.75}
        interactive={false}
      />,
    )

    expect(
      screen.getByRole('img', {
        name: 'Star Power 75 percent charged. Ready to activate.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the Tap Mode meter interactive', () => {
    render(
      <StarPowerRail
        highwayLength={55}
        active={false}
        charge={0.75}
        onActivate={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Star Power 75 percent charged. Swipe up or tap to activate.',
      }),
    ).toBeInTheDocument()
  })
})
