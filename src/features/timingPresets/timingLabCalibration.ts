import type { CalibrationSettings } from '../../types/game'

function clampOffset(value: number): number {
  return Math.max(-400, Math.min(400, Math.round(value)))
}

interface TimingLabCalibrationOptions {
  visualTimingMedianMs: number
  audioTimingMedianMs: number
}

/**
 * Both stages include the same player/input path. Subtracting their medians
 * isolates audio output relative to the display, while the visual median gives
 * the scoring correction for the active input device.
 */
export function timingLabCalibration({
  visualTimingMedianMs,
  audioTimingMedianMs,
}: TimingLabCalibrationOptions): CalibrationSettings {
  return {
    modelVersion: 2,
    audioOffsetMs: clampOffset(
      audioTimingMedianMs - visualTimingMedianMs,
    ),
    inputOffsetMs: clampOffset(visualTimingMedianMs),
    videoOffsetMs: 0,
  }
}
