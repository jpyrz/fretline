import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalibrationSettings } from '../../types/game'
import {
  activeTimingPreset,
  createTimingPreset,
  duplicateTimingPreset,
  loadTimingPresetState,
  outputLatencyDifferenceMs,
  removeTimingPreset,
  renameTimingPreset,
  setActivePresetMeasuredLatency,
  setLastObservedOutputLatency,
  TIMING_PRESETS_STORAGE_KEY,
  updateActivePresetCalibration,
} from './timingPresets'

const calibration: CalibrationSettings = {
  modelVersion: 2,
  audioOffsetMs: 4,
  inputOffsetMs: 18,
  videoOffsetMs: -6,
}

describe('timing presets', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('migrates the current calibration into Default Setup', () => {
    const state = loadTimingPresetState(calibration)
    expect(state.presets).toHaveLength(1)
    expect(activeTimingPreset(state)).toMatchObject({
      name: 'Default Setup',
      calibration,
    })
  })

  it('restores valid presets and falls back to the first active preset', () => {
    localStorage.setItem(
      TIMING_PRESETS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activePresetId: 'missing',
        presets: [
          {
            id: 'airpods',
            name: ' AirPods ',
            calibration,
            measuredOutputLatencySeconds: 0.12,
          },
        ],
      }),
    )
    const state = loadTimingPresetState(calibration)
    expect(state.activePresetId).toBe('airpods')
    expect(activeTimingPreset(state).name).toBe('AirPods')
  })

  it('updates only the active preset calibration', () => {
    let state = loadTimingPresetState(calibration)
    state = createTimingPreset(state, calibration, 'TV')
    state = updateActivePresetCalibration(state, {
      ...calibration,
      inputOffsetMs: 72,
    })
    expect(activeTimingPreset(state).calibration.inputOffsetMs).toBe(72)
    expect(state.presets[0].calibration.inputOffsetMs).toBe(18)
  })

  it('creates, duplicates, renames, and safely removes presets', () => {
    let state = loadTimingPresetState(calibration)
    state = createTimingPreset(state, calibration, 'TV')
    const tvId = state.activePresetId
    state = duplicateTimingPreset(state, tvId)
    state = renameTimingPreset(state, state.activePresetId, 'Living Room')
    expect(activeTimingPreset(state).name).toBe('Living Room')
    state = removeTimingPreset(state, state.activePresetId)
    expect(state.presets).toHaveLength(2)
    state = removeTimingPreset(state, tvId)
    state = removeTimingPreset(state, state.presets[0].id)
    expect(state.presets).toHaveLength(1)
  })

  it('reports a meaningful output latency route difference', () => {
    let state = loadTimingPresetState(calibration)
    state = setActivePresetMeasuredLatency(state, 0.04)
    state = setLastObservedOutputLatency(state, 0.091)
    expect(outputLatencyDifferenceMs(state)).toBe(51)
  })
})
