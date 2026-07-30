import { describe, expect, it } from 'vitest'
import {
  addStarPowerPhrase,
  addWhammyStarPower,
  canActivateStarPower,
  drainStarPower,
  isWhammyStarPowerSustain,
} from './starPower'

describe('star power rules', () => {
  it('awards one quarter-bar per completed phrase and caps at full', () => {
    expect(addStarPowerPhrase(0)).toBe(0.25)
    expect(addStarPowerPhrase(0.75)).toBe(1)
    expect(addStarPowerPhrase(0.9)).toBe(1)
  })

  it('becomes activatable at half a bar', () => {
    expect(canActivateStarPower(0.49, false)).toBe(false)
    expect(canActivateStarPower(0.5, false)).toBe(true)
    expect(canActivateStarPower(1, true)).toBe(false)
  })

  it('drains a full bar across eight four-beat measures', () => {
    const resolution = 192
    expect(drainStarPower(1, resolution * 16, resolution)).toBe(0.5)
    expect(drainStarPower(1, resolution * 32, resolution)).toBe(0)
  })

  it('fills from whammy across thirty beats and only while eligible', () => {
    const resolution = 192
    expect(
      addWhammyStarPower(0, resolution * 15, resolution, true),
    ).toBe(0.5)
    expect(
      addWhammyStarPower(0.4, resolution * 3, resolution, false),
    ).toBe(0.4)
    expect(
      addWhammyStarPower(0.95, resolution * 15, resolution, true),
    ).toBe(1)
  })

  it('only allows whammy gain on a live star-power sustain', () => {
    const sustain = {
      starPower: true,
      timeSeconds: 2,
      sustainSeconds: 3,
    }
    expect(isWhammyStarPowerSustain(sustain, 'holding', 4)).toBe(true)
    expect(
      isWhammyStarPowerSustain(
        { ...sustain, starPower: false },
        'holding',
        4,
      ),
    ).toBe(false)
    expect(isWhammyStarPowerSustain(sustain, 'released', 4)).toBe(false)
    expect(isWhammyStarPowerSustain(sustain, 'holding', 5)).toBe(false)
  })
})
