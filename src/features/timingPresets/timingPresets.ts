import type { CalibrationSettings } from '../../types/game'
import type { TimingPreset, TimingPresetState } from './types'

export const TIMING_PRESETS_STORAGE_KEY = 'fretline:timing-presets'
export const OUTPUT_LATENCY_WARNING_THRESHOLD_MS = 25

const DEFAULT_PRESET_ID = 'default-setup'

function finiteOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-400, Math.min(400, Math.round(value)))
    : 0
}

function normalizeCalibration(value: unknown): CalibrationSettings {
  const calibration =
    typeof value === 'object' && value !== null
      ? (value as Partial<CalibrationSettings>)
      : {}
  return {
    modelVersion: 2,
    audioOffsetMs: finiteOffset(calibration.audioOffsetMs),
    inputOffsetMs: finiteOffset(calibration.inputOffsetMs),
    videoOffsetMs: finiteOffset(calibration.videoOffsetMs),
  }
}

function finiteLatency(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(2, value)
    : null
}

function presetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `timing-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 40)
  return name || fallback
}

function defaultState(calibration: CalibrationSettings): TimingPresetState {
  const now = Date.now()
  return {
    version: 1,
    activePresetId: DEFAULT_PRESET_ID,
    presets: [
      {
        id: DEFAULT_PRESET_ID,
        name: 'Default Setup',
        calibration: normalizeCalibration(calibration),
        measuredOutputLatencySeconds: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    lastObservedOutputLatencySeconds: null,
  }
}

export function loadTimingPresetState(
  legacyCalibration: CalibrationSettings,
): TimingPresetState {
  try {
    const raw = localStorage.getItem(TIMING_PRESETS_STORAGE_KEY)
    if (!raw) return defaultState(legacyCalibration)
    const value = JSON.parse(raw) as Partial<TimingPresetState>
    if (value.version !== 1 || !Array.isArray(value.presets)) {
      return defaultState(legacyCalibration)
    }
    const now = Date.now()
    const presets = value.presets.flatMap((candidate, index) => {
      if (!candidate || typeof candidate !== 'object') return []
      const item = candidate as Partial<TimingPreset>
      if (typeof item.id !== 'string' || !item.id.trim()) return []
      return [{
        id: item.id,
        name: cleanName(item.name, `Setup ${index + 1}`),
        calibration: normalizeCalibration(item.calibration),
        measuredOutputLatencySeconds: finiteLatency(
          item.measuredOutputLatencySeconds,
        ),
        createdAt:
          typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt:
          typeof item.updatedAt === 'number' ? item.updatedAt : now,
      }]
    })
    if (presets.length === 0) return defaultState(legacyCalibration)
    const activePresetId = presets.some(
      (preset) => preset.id === value.activePresetId,
    )
      ? value.activePresetId as string
      : presets[0].id
    return {
      version: 1,
      activePresetId,
      presets,
      lastObservedOutputLatencySeconds: finiteLatency(
        value.lastObservedOutputLatencySeconds,
      ),
    }
  } catch {
    return defaultState(legacyCalibration)
  }
}

export function activeTimingPreset(state: TimingPresetState): TimingPreset {
  return (
    state.presets.find((preset) => preset.id === state.activePresetId) ??
    state.presets[0]
  )
}

export function updateActivePresetCalibration(
  state: TimingPresetState,
  calibration: CalibrationSettings,
): TimingPresetState {
  return {
    ...state,
    presets: state.presets.map((preset) =>
      preset.id === state.activePresetId
        ? {
            ...preset,
            calibration: normalizeCalibration(calibration),
            updatedAt: Date.now(),
          }
        : preset,
    ),
  }
}

export function createTimingPreset(
  state: TimingPresetState,
  calibration: CalibrationSettings,
  requestedName?: string,
): TimingPresetState {
  const now = Date.now()
  const preset: TimingPreset = {
    id: presetId(),
    name: cleanName(requestedName, `Setup ${state.presets.length + 1}`),
    calibration: normalizeCalibration(calibration),
    measuredOutputLatencySeconds: null,
    createdAt: now,
    updatedAt: now,
  }
  return {
    ...state,
    activePresetId: preset.id,
    presets: [...state.presets, preset],
  }
}

export function duplicateTimingPreset(
  state: TimingPresetState,
  presetIdToCopy: string,
): TimingPresetState {
  const source =
    state.presets.find((preset) => preset.id === presetIdToCopy) ??
    activeTimingPreset(state)
  const now = Date.now()
  const preset: TimingPreset = {
    ...source,
    id: presetId(),
    name: cleanName(`${source.name} Copy`, 'Setup Copy'),
    createdAt: now,
    updatedAt: now,
  }
  return {
    ...state,
    activePresetId: preset.id,
    presets: [...state.presets, preset],
  }
}

export function renameTimingPreset(
  state: TimingPresetState,
  id: string,
  name: string,
): TimingPresetState {
  return {
    ...state,
    presets: state.presets.map((preset) =>
      preset.id === id
        ? { ...preset, name: cleanName(name, preset.name), updatedAt: Date.now() }
        : preset,
    ),
  }
}

export function removeTimingPreset(
  state: TimingPresetState,
  id: string,
): TimingPresetState {
  if (state.presets.length <= 1) return state
  const presets = state.presets.filter((preset) => preset.id !== id)
  if (presets.length === state.presets.length) return state
  return {
    ...state,
    presets,
    activePresetId:
      state.activePresetId === id ? presets[0].id : state.activePresetId,
  }
}

export function setActivePresetMeasuredLatency(
  state: TimingPresetState,
  latencySeconds: number,
): TimingPresetState {
  const latency = finiteLatency(latencySeconds)
  if (latency === null) return state
  return {
    ...state,
    lastObservedOutputLatencySeconds: latency,
    presets: state.presets.map((preset) =>
      preset.id === state.activePresetId
        ? { ...preset, measuredOutputLatencySeconds: latency, updatedAt: Date.now() }
        : preset,
    ),
  }
}

export function setLastObservedOutputLatency(
  state: TimingPresetState,
  latencySeconds: number,
): TimingPresetState {
  const latency = finiteLatency(latencySeconds)
  return latency === null
    ? state
    : { ...state, lastObservedOutputLatencySeconds: latency }
}

export function outputLatencyDifferenceMs(
  state: TimingPresetState,
): number | null {
  const baseline = activeTimingPreset(state).measuredOutputLatencySeconds
  const observed = state.lastObservedOutputLatencySeconds
  if (baseline === null || observed === null) return null
  return Math.round(Math.abs(observed - baseline) * 1000)
}
