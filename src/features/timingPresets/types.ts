import type { CalibrationSettings } from '../../types/game'

export interface TimingPreset {
  id: string
  name: string
  calibration: CalibrationSettings
  measuredOutputLatencySeconds: number | null
  createdAt: number
  updatedAt: number
}

export interface TimingPresetState {
  version: 1
  activePresetId: string
  presets: TimingPreset[]
  lastObservedOutputLatencySeconds: number | null
}
