import { describe, expect, it } from 'vitest'
import { timingLabCalibration } from './timingLabCalibration'

const calibration = {
  modelVersion: 2 as const,
  audioOffsetMs: 0,
  inputOffsetMs: 0,
  videoOffsetMs: 0,
}

describe('timingLabCalibration', () => {
  it('keeps scoring aligned to the measured tap and delays visuals for Bluetooth output', () => {
    expect(
      timingLabCalibration({
        calibration,
        runInputOffsetMs: 0,
        suggestedCorrectionMs: 146,
        outputLatencySeconds: 0.128,
      }),
    ).toEqual({
      ...calibration,
      inputOffsetMs: 146,
      videoOffsetMs: -128,
    })
  })

  it('repairs an existing input-only preset even when its residual is near zero', () => {
    expect(
      timingLabCalibration({
        calibration: { ...calibration, inputOffsetMs: 146 },
        runInputOffsetMs: 146,
        suggestedCorrectionMs: 1,
        outputLatencySeconds: 0.128,
      }),
    ).toMatchObject({ inputOffsetMs: 147, videoOffsetMs: -128 })
  })

  it('falls back to the measured correction when output latency is unavailable', () => {
    expect(
      timingLabCalibration({
        calibration,
        runInputOffsetMs: 0,
        suggestedCorrectionMs: 52,
        outputLatencySeconds: 0,
      }),
    ).toMatchObject({ inputOffsetMs: 52, videoOffsetMs: -52 })
  })

  it('repairs an existing input-only preset when the browser cannot report output latency', () => {
    expect(
      timingLabCalibration({
        calibration: { ...calibration, inputOffsetMs: 146 },
        runInputOffsetMs: 146,
        suggestedCorrectionMs: 0,
        outputLatencySeconds: 0,
      }),
    ).toMatchObject({ inputOffsetMs: 146, videoOffsetMs: -146 })
  })
})
