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

  it('migrates legacy Timing Lab correction to audio correction', () => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify({ inputOffsetMs: 34, videoOffsetMs: -8 }),
    )

    expect(loadCalibrationSettings()).toEqual({
      audioOffsetMs: 34,
      inputOffsetMs: 0,
      videoOffsetMs: -8,
    })
  })

  it('preserves independent timing corrections in the current format', () => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify({
        audioOffsetMs: 22,
        inputOffsetMs: 7,
        videoOffsetMs: -4,
      }),
    )

    expect(loadCalibrationSettings()).toEqual({
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
