import { describe, expect, it } from 'vitest'
import type { HidBinding } from '../types/game'
import {
  activeHidBindings,
  changedHidBytes,
  hidBindingActive,
} from './hidInput'

function reports(reportId: number, bytes: number[]): Map<number, Uint8Array> {
  return new Map([[reportId, Uint8Array.from(bytes)]])
}

describe('direct HID input', () => {
  it('captures the changed bits in an input report', () => {
    expect(
      activeHidBindings(reports(1, [0b00000100]), reports(1, [0])),
    ).toEqual([
      {
        type: 'hid',
        reportId: 1,
        byteIndex: 0,
        mask: 0b00000100,
        activeValue: 0b00000100,
      },
    ])
  })

  it('supports controls whose active value clears resting bits', () => {
    const [binding] = activeHidBindings(
      reports(0, [0b00000000]),
      reports(0, [0b00001000]),
    )

    expect(binding.activeValue).toBe(0)
    expect(hidBindingActive(reports(0, [0]), binding)).toBe(true)
    expect(hidBindingActive(reports(0, [0b00001000]), binding)).toBe(false)
  })

  it('prefers a single changed button bit over wider changes', () => {
    const bindings = activeHidBindings(
      reports(0, [0b00000011, 0b00000100]),
      reports(0, [0, 0]),
    )

    expect(bindings[0].byteIndex).toBe(1)
  })

  it('identifies and excludes bytes that changed during motion calibration', () => {
    const resting = reports(0, [0, 128, 64])
    const moving = reports(0, [0, 151, 92])
    const ignored = changedHidBytes(moving, resting)

    expect([...ignored]).toEqual(['0:1', '0:2'])
    expect(
      activeHidBindings(
        reports(0, [0b00000100, 151, 92]),
        resting,
        ignored,
      ),
    ).toEqual([
      {
        type: 'hid',
        reportId: 0,
        byteIndex: 0,
        mask: 0b00000100,
        activeValue: 0b00000100,
      },
    ])
  })

  it('reads a saved binding from the latest report', () => {
    const binding: HidBinding = {
      type: 'hid',
      reportId: 2,
      byteIndex: 1,
      mask: 0b00010000,
      activeValue: 0b00010000,
    }

    expect(hidBindingActive(reports(2, [0, 0b00010000]), binding)).toBe(true)
    expect(hidBindingActive(reports(2, [0, 0]), binding)).toBe(false)
  })
})
