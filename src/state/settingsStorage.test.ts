import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultHighwaySettings,
  defaultVisualSettings,
  loadCalibrationSettings,
  loadHighwaySettings,
  loadStoredValue,
  loadVisualSettings,
  STORAGE_KEYS,
} from './settingsStorage'

describe('settings storage', () => {
  beforeEach(() => localStorage.clear())

  it('falls back when storage contains invalid JSON', () => {
    localStorage.setItem('invalid', '{')
    expect(loadStoredValue('invalid', { safe: true })).toEqual({ safe: true })
  })

  it('clamps persisted highway settings to supported ranges', () => {
    localStorage.setItem(
      STORAGE_KEYS.highway,
      JSON.stringify({ noteSpeed: 99, length: 2, missFeedback: false }),
    )
    expect(loadHighwaySettings()).toEqual({
      noteSpeed: 18,
      length: 45,
      missFeedback: false,
    })
  })

  it('normalizes partial visual settings', () => {
    localStorage.setItem(
      STORAGE_KEYS.visualSettings,
      JSON.stringify({ backgroundDim: -20, highwayOpacity: 500 }),
    )
    expect(loadVisualSettings()).toEqual({
      ...defaultVisualSettings,
      backgroundDim: 0,
      highwayOpacity: 100,
    })
  })

  it('preserves legacy Timing Lab correction as input correction', () => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify({ inputOffsetMs: 34, videoOffsetMs: -8 }),
    )

    expect(loadCalibrationSettings()).toEqual({
      modelVersion: 2,
      audioOffsetMs: 0,
      inputOffsetMs: 34,
      videoOffsetMs: -8,
    })
  })

  it('undoes the flawed automatic audio correction once', () => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify({
        audioOffsetMs: 22,
        inputOffsetMs: 7,
        videoOffsetMs: -4,
      }),
    )

    expect(loadCalibrationSettings()).toEqual({
      modelVersion: 2,
      audioOffsetMs: 0,
      inputOffsetMs: 29,
      videoOffsetMs: -4,
    })
  })

  it('preserves independent timing corrections in the current format', () => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify({
        modelVersion: 2,
        audioOffsetMs: 22,
        inputOffsetMs: 7,
        videoOffsetMs: -4,
      }),
    )

    expect(loadCalibrationSettings()).toEqual({
      modelVersion: 2,
      audioOffsetMs: 22,
      inputOffsetMs: 7,
      videoOffsetMs: -4,
    })
  })

  it('uses complete defaults when no settings have been stored', () => {
    expect(loadHighwaySettings()).toEqual(defaultHighwaySettings)
    expect(loadVisualSettings()).toEqual(defaultVisualSettings)
  })
})
