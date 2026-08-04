import { describe, expect, it } from 'vitest'
import { timingLabCalibration } from './timingLabCalibration'

describe('timingLabCalibration', () => {
  it('separates speaker output timing from touch input timing', () => {
    expect(
      timingLabCalibration({
        visualTimingMedianMs: -25,
        audioTimingMedianMs: 0,
      }),
    ).toEqual({
      modelVersion: 2,
      audioOffsetMs: 25,
      inputOffsetMs: -25,
      videoOffsetMs: 0,
    })
  })

  it('isolates Bluetooth output delay without moving the hit window', () => {
    expect(
      timingLabCalibration({
        visualTimingMedianMs: -25,
        audioTimingMedianMs: 150,
      }),
    ).toEqual({
      modelVersion: 2,
      audioOffsetMs: 175,
      inputOffsetMs: -25,
      videoOffsetMs: 0,
    })
  })

  it('accounts for a delayed display route such as a TV', () => {
    expect(
      timingLabCalibration({
        visualTimingMedianMs: 80,
        audioTimingMedianMs: 135,
      }),
    ).toEqual({
      modelVersion: 2,
      audioOffsetMs: 55,
      inputOffsetMs: 80,
      videoOffsetMs: 0,
    })
  })

  it('clamps extreme measurements to engine-supported bounds', () => {
    expect(
      timingLabCalibration({
        visualTimingMedianMs: 900,
        audioTimingMedianMs: -900,
      }),
    ).toEqual({
      modelVersion: 2,
      audioOffsetMs: -400,
      inputOffsetMs: 400,
      videoOffsetMs: 0,
    })
  })
})
