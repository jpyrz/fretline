import { describe, expect, it } from 'vitest'
import { spriteFrameCell, spriteFrameIndex } from './vfxSprites'

describe('spriteFrameIndex', () => {
  it('maps normalized animation progress across every atlas frame', () => {
    expect(spriteFrameIndex(0, 8)).toBe(0)
    expect(spriteFrameIndex(0.125, 8)).toBe(1)
    expect(spriteFrameIndex(0.5, 8)).toBe(4)
    expect(spriteFrameIndex(1, 8)).toBe(7)
  })

  it('clamps progress outside the animation range', () => {
    expect(spriteFrameIndex(-1, 6)).toBe(0)
    expect(spriteFrameIndex(5, 6)).toBe(5)
  })
})

describe('spriteFrameCell', () => {
  it('converts a frame index into its atlas column and row', () => {
    const atlas = { columns: 4, rows: 2, frameCount: 8 }

    expect(spriteFrameCell(0, atlas)).toEqual({ column: 0, row: 0 })
    expect(spriteFrameCell(3, atlas)).toEqual({ column: 3, row: 0 })
    expect(spriteFrameCell(4, atlas)).toEqual({ column: 0, row: 1 })
    expect(spriteFrameCell(7, atlas)).toEqual({ column: 3, row: 1 })
  })
})
