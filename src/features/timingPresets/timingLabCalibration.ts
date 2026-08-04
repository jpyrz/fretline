import type { CalibrationSettings } from '../../types/game'

function clampOffset(value: number): number {
  return Math.max(-200, Math.min(200, Math.round(value)))
}

interface TimingLabCalibrationOptions {
  calibration: CalibrationSettings
  runInputOffsetMs: number
  suggestedCorrectionMs: number
  outputLatencySeconds: number | null
}

/**
 * The audio-only lab measures the full path from Web Audio through the output
 * route and back through the player's input. Scoring needs that whole residual
 * correction. The highway separately needs to wait for wireless audio output,
 * otherwise Bluetooth can score correctly while still looking early.
 */
export function timingLabCalibration({
  calibration,
  runInputOffsetMs,
  suggestedCorrectionMs,
  outputLatencySeconds,
}: TimingLabCalibrationOptions): CalibrationSettings {
  const nextInputOffsetMs = clampOffset(
    runInputOffsetMs + suggestedCorrectionMs,
  )
  const usableOutputLatency =
    outputLatencySeconds !== null &&
    Number.isFinite(outputLatencySeconds) &&
    outputLatencySeconds >= 0.004
  const nextVideoOffsetMs = usableOutputLatency
    ? clampOffset(-outputLatencySeconds * 1000)
    : clampOffset(-nextInputOffsetMs)

  return {
    ...calibration,
    inputOffsetMs: nextInputOffsetMs,
    videoOffsetMs: nextVideoOffsetMs,
  }
}
