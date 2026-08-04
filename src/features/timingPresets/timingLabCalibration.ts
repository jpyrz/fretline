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
 * route and back through the player's input. Wireless output delay belongs in
 * audio correction so the heard song meets the unchanged highway. Only the
 * remaining controller/touch delay belongs in input correction.
 */
export function timingLabCalibration({
  calibration,
  runInputOffsetMs,
  suggestedCorrectionMs,
  outputLatencySeconds,
}: TimingLabCalibrationOptions): CalibrationSettings {
  const usableOutputLatency =
    outputLatencySeconds !== null &&
    Number.isFinite(outputLatencySeconds) &&
    outputLatencySeconds >= 0.004
  const measuredEndToEndOffsetMs = clampOffset(
    calibration.audioOffsetMs +
      runInputOffsetMs +
      suggestedCorrectionMs,
  )
  const nextAudioOffsetMs = usableOutputLatency
    ? clampOffset(outputLatencySeconds * 1000)
    : measuredEndToEndOffsetMs
  const audioCorrectionChangeMs =
    nextAudioOffsetMs - calibration.audioOffsetMs
  const nextInputOffsetMs = clampOffset(
    runInputOffsetMs +
      suggestedCorrectionMs -
      audioCorrectionChangeMs,
  )
  const priorAutomaticVisualOffsetMs = usableOutputLatency
    ? clampOffset(-outputLatencySeconds * 1000)
    : clampOffset(-runInputOffsetMs)
  const nextVideoOffsetMs =
    Math.abs(calibration.videoOffsetMs - priorAutomaticVisualOffsetMs) <= 20
      ? 0
      : calibration.videoOffsetMs

  return {
    ...calibration,
    audioOffsetMs: nextAudioOffsetMs,
    inputOffsetMs: nextInputOffsetMs,
    videoOffsetMs: nextVideoOffsetMs,
  }
}
