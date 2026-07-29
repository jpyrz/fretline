import { describe, expect, it } from 'vitest'
import { nextMenuIndex } from './menuNavigation'

describe('menu navigation', () => {
  it('moves immediately from the visually selected default item', () => {
    expect(nextMenuIndex(3, -1, 0, 1)).toBe(1)
    expect(nextMenuIndex(3, -1, 0, -1)).toBe(2)
  })

  it('moves relative to the currently focused item', () => {
    expect(nextMenuIndex(4, 1, 0, 1)).toBe(2)
    expect(nextMenuIndex(4, 1, 0, -1)).toBe(0)
  })

  it('starts at the nearest edge when there is no default', () => {
    expect(nextMenuIndex(3, -1, -1, 1)).toBe(0)
    expect(nextMenuIndex(3, -1, -1, -1)).toBe(2)
  })

  it('returns no selection for an empty menu', () => {
    expect(nextMenuIndex(0, -1, -1, 1)).toBe(-1)
  })
})
