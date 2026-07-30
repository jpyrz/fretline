import { describe, expect, it } from 'vitest'
import { TouchContactTracker } from './touchContacts'

describe('touch contact tracker', () => {
  it('groups simultaneous lane presses into one timestamped chord', () => {
    const tracker = new TouchContactTracker()
    tracker.press(1, 1, 105)
    tracker.press(2, 3, 109)

    expect(tracker.consumePendingTap()).toEqual({
      lanes: [1, 3],
      open: false,
      timestamp: 105,
    })
    expect(tracker.snapshot()).toEqual({
      lanes: [1, 3],
      open: false,
    })
  })

  it('releases only the matching pointer for sustain tracking', () => {
    const tracker = new TouchContactTracker()
    tracker.press(1, 0, 100)
    tracker.press(2, 2, 101)
    tracker.release(1)

    expect(tracker.snapshot()).toEqual({
      lanes: [2],
      open: false,
    })
  })

  it('includes an already-held sustain lane in the next tap', () => {
    const tracker = new TouchContactTracker()
    tracker.press(1, 0, 100)
    tracker.consumePendingTap()
    tracker.press(2, 2, 500)

    expect(tracker.consumePendingTap()).toEqual({
      lanes: [0, 2],
      open: false,
      timestamp: 500,
    })
  })

  it('represents an open-note press separately from fretted lanes', () => {
    const tracker = new TouchContactTracker()
    tracker.press(4, null, 80)

    expect(tracker.consumePendingTap()).toEqual({
      lanes: [],
      open: true,
      timestamp: 80,
    })
  })
})
