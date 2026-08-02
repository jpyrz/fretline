import type { PlayPreferences } from '../lib/trackSelection'
import { normalizePracticeSpeed } from '../lib/practiceMode'
import {
  recommendedInputMode,
  touchInputAvailable,
} from '../lib/inputMode'
import { normalizeKeyboardMapping } from '../lib/keyboardMapping'
import type {
  AudioSettings,
  CalibrationSettings,
  ControllerMapping,
  HighwaySettings,
  KeyboardMapping,
  VisualSettings,
} from '../types/game'

export const STORAGE_KEYS = {
  calibration: 'fretline:calibration',
  highway: 'fretline:highway',
  audio: 'fretline:audio',
  visualSettings: 'fretline:visual-settings',
  playPreferences: 'fretline:play-preferences',
  controller: 'fretline:controller',
  keyboard: 'fretline:keyboard',
  selectedSong: 'fretline:selected-song',
} as const

export const defaultCalibration: CalibrationSettings = {
  modelVersion: 2,
  audioOffsetMs: 0,
  inputOffsetMs: 0,
  videoOffsetMs: 0,
}

export const defaultHighwaySettings: HighwaySettings = {
  noteSpeed: 12,
  length: 55,
  missFeedback: true,
}

export const defaultAudioSettings: AudioSettings = {
  homeMusicMuted: false,
}

export const defaultVisualSettings: VisualSettings = {
  backgroundSelection: 'default',
  highwaySelection: 'default',
  backgroundDim: 42,
  highwayOpacity: 72,
  backgroundDriveFolder: null,
  highwayDriveFolder: null,
}

export const defaultPlayPreferences: PlayPreferences = {
  difficulty: 'Expert',
  instrumentId: 'Single',
  inputMode: 'standard',
  practiceSpeed: 1,
}

export function loadStoredValue<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export function loadHighwaySettings(): HighwaySettings {
  const value = loadStoredValue<unknown>(
    STORAGE_KEYS.highway,
    defaultHighwaySettings,
  )
  const stored =
    typeof value === 'object' && value !== null
      ? (value as Partial<HighwaySettings>)
      : {}

  return {
    noteSpeed:
      typeof stored.noteSpeed === 'number' &&
      Number.isFinite(stored.noteSpeed)
        ? Math.max(6, Math.min(18, stored.noteSpeed))
        : defaultHighwaySettings.noteSpeed,
    length:
      typeof stored.length === 'number' && Number.isFinite(stored.length)
        ? Math.max(45, Math.min(100, stored.length))
        : defaultHighwaySettings.length,
    missFeedback:
      typeof stored.missFeedback === 'boolean'
        ? stored.missFeedback
        : defaultHighwaySettings.missFeedback,
  }
}

export function loadVisualSettings(): VisualSettings {
  const value = loadStoredValue<Partial<VisualSettings>>(
    STORAGE_KEYS.visualSettings,
    defaultVisualSettings,
  )
  return {
    backgroundSelection:
      typeof value.backgroundSelection === 'string'
        ? value.backgroundSelection
        : 'default',
    highwaySelection:
      typeof value.highwaySelection === 'string'
        ? value.highwaySelection
        : 'default',
    backgroundDim:
      typeof value.backgroundDim === 'number'
        ? Math.max(0, Math.min(90, value.backgroundDim))
        : defaultVisualSettings.backgroundDim,
    highwayOpacity:
      typeof value.highwayOpacity === 'number'
        ? Math.max(20, Math.min(100, value.highwayOpacity))
        : defaultVisualSettings.highwayOpacity,
    backgroundDriveFolder: value.backgroundDriveFolder ?? null,
    highwayDriveFolder: value.highwayDriveFolder ?? null,
  }
}

function finiteOffset(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-200, Math.min(200, value))
    : fallback
}

export function loadCalibrationSettings(): CalibrationSettings {
  const value = loadStoredValue<unknown>(
    STORAGE_KEYS.calibration,
    defaultCalibration,
  )
  const stored =
    typeof value === 'object' && value !== null
      ? (value as Partial<CalibrationSettings>)
      : {}
  if (stored.modelVersion === 2) {
    return {
      modelVersion: 2,
      audioOffsetMs: finiteOffset(stored.audioOffsetMs),
      inputOffsetMs: finiteOffset(stored.inputOffsetMs),
      videoOffsetMs: finiteOffset(stored.videoOffsetMs),
    }
  }

  // The short-lived audio-calibration model moved music based on human taps.
  // Fold either legacy correction back into input timing once, then leave song
  // audio untouched unless the player explicitly adjusts Audio correction.
  const migratedInputOffset =
    finiteOffset(stored.inputOffsetMs) +
    finiteOffset(stored.audioOffsetMs)
  return {
    modelVersion: 2,
    audioOffsetMs: 0,
    inputOffsetMs: finiteOffset(migratedInputOffset),
    videoOffsetMs: finiteOffset(stored.videoOffsetMs),
  }
}

export function loadInitialSettings(): {
  calibration: CalibrationSettings
  highway: HighwaySettings
  audio: AudioSettings
  visual: VisualSettings
  play: PlayPreferences
  controller: ControllerMapping | null
  keyboard: KeyboardMapping
} {
  const controller = loadStoredValue<ControllerMapping | null>(
    STORAGE_KEYS.controller,
    null,
  )
  const storedPlay = loadStoredValue<Partial<PlayPreferences>>(
    STORAGE_KEYS.playPreferences,
    defaultPlayPreferences,
  )
  return {
    calibration: loadCalibrationSettings(),
    highway: loadHighwaySettings(),
    audio: loadStoredValue(STORAGE_KEYS.audio, defaultAudioSettings),
    visual: loadVisualSettings(),
    play: {
      difficulty:
        storedPlay.difficulty === 'Easy' ||
        storedPlay.difficulty === 'Medium' ||
        storedPlay.difficulty === 'Hard' ||
        storedPlay.difficulty === 'Expert'
          ? storedPlay.difficulty
          : defaultPlayPreferences.difficulty,
      instrumentId:
        typeof storedPlay.instrumentId === 'string'
          ? storedPlay.instrumentId
          : defaultPlayPreferences.instrumentId,
      inputMode: recommendedInputMode(storedPlay.inputMode, {
        touchAvailable: touchInputAvailable(),
        controllerConfigured: controller !== null,
      }),
      practiceSpeed: normalizePracticeSpeed(storedPlay.practiceSpeed),
    },
    controller,
    keyboard: normalizeKeyboardMapping(
      loadStoredValue<unknown>(STORAGE_KEYS.keyboard, null),
    ),
  }
}
