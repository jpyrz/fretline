/* oxlint-disable react/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { calibrationSong } from '../lib/calibrationSong'
import {
  activeTimingPreset,
  createTimingPreset as createTimingPresetState,
  duplicateTimingPreset as duplicateTimingPresetState,
  loadTimingPresetState,
  outputLatencyDifferenceMs,
  removeTimingPreset,
  renameTimingPreset as renameTimingPresetState,
  setActivePresetMeasuredLatency,
  setLastObservedOutputLatency,
  TIMING_PRESETS_STORAGE_KEY,
  updateActivePresetCalibration,
} from '../features/timingPresets/timingPresets'
import type { TimingPreset } from '../features/timingPresets/types'
import {
  deletePersistedVisualAsset,
  deletePersistedSong,
  loadPersistedVisualAssets,
  loadPersistedSongs,
  persistVisualAssets,
  persistSong,
} from '../lib/songLibrary'
import type { PlayPreferences } from '../lib/trackSelection'
import type {
  CalibrationSettings,
  ControllerMapping,
  AudioSettings,
  HighwaySettings,
  KeyboardMapping,
  LocalSong,
  VisualAsset,
  VisualSettings,
} from '../types/game'
import {
  loadInitialSettings,
  STORAGE_KEYS,
} from './settingsStorage'

interface AppStateValue {
  song: LocalSong
  songs: LocalSong[]
  setSong: (song: LocalSong) => void
  addSongs: (songs: LocalSong[]) => Promise<void>
  addImportedSong: (song: LocalSong) => Promise<void>
  selectSong: (songId: string) => void
  removeSong: (songId: string) => void
  selectTrack: (trackName: string) => void
  useTimingLab: () => void
  libraryReady: boolean
  librarySaving: boolean
  libraryError: string
  calibration: CalibrationSettings
  setCalibration: (calibration: CalibrationSettings) => void
  timingPresets: TimingPreset[]
  activeTimingPreset: TimingPreset
  timingOutputLatencyDifferenceMs: number | null
  activateTimingPreset: (presetId: string) => void
  createTimingPreset: (name?: string) => void
  duplicateTimingPreset: (presetId: string) => void
  renameTimingPreset: (presetId: string, name: string) => void
  deleteTimingPreset: (presetId: string) => void
  observeOutputLatency: (latencySeconds: number) => void
  saveActiveTimingPresetLatency: (latencySeconds: number) => void
  highwaySettings: HighwaySettings
  setHighwaySettings: (settings: HighwaySettings) => void
  audioSettings: AudioSettings
  setAudioSettings: (settings: AudioSettings) => void
  visualAssets: VisualAsset[]
  visualAssetsReady: boolean
  visualAssetsSaving: boolean
  visualAssetsError: string
  addVisualAssets: (assets: VisualAsset[]) => Promise<void>
  removeVisualAsset: (assetId: string) => Promise<void>
  visualSettings: VisualSettings
  setVisualSettings: (settings: VisualSettings) => void
  playPreferences: PlayPreferences
  setPlayPreferences: (preferences: PlayPreferences) => void
  controllerMapping: ControllerMapping | null
  setControllerMapping: (mapping: ControllerMapping | null) => void
  keyboardMapping: KeyboardMapping
  setKeyboardMapping: (mapping: KeyboardMapping) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

function upsertSong(songs: LocalSong[], nextSong: LocalSong): LocalSong[] {
  const existingIndex = songs.findIndex((song) => song.id === nextSong.id)
  if (existingIndex === -1) return [...songs, nextSong]

  return songs.map((song, index) =>
    index === existingIndex ? nextSong : song,
  )
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [initialSettings] = useState(loadInitialSettings)
  const [initialTimingPresets] = useState(() =>
    loadTimingPresetState(initialSettings.calibration),
  )
  const [timingPresetState, setTimingPresetState] = useState(
    initialTimingPresets,
  )
  const [song, setCurrentSong] = useState<LocalSong>(calibrationSong)
  const [songs, setSongs] = useState<LocalSong[]>([calibrationSong])
  const [libraryReady, setLibraryReady] = useState(false)
  const [librarySaving, setLibrarySaving] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [calibration, setCalibrationState] = useState<CalibrationSettings>(
    activeTimingPreset(initialTimingPresets).calibration,
  )
  const [highwaySettings, setHighwaySettings] = useState<HighwaySettings>(
    initialSettings.highway,
  )
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(
    initialSettings.audio,
  )
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([])
  const [visualAssetsReady, setVisualAssetsReady] = useState(false)
  const [visualAssetsSaving, setVisualAssetsSaving] = useState(false)
  const [visualAssetsError, setVisualAssetsError] = useState('')
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(
    initialSettings.visual,
  )
  const [playPreferences, setPlayPreferences] = useState<PlayPreferences>(
    initialSettings.play,
  )
  const [controllerMapping, setControllerMapping] =
    useState<ControllerMapping | null>(initialSettings.controller)
  const [keyboardMapping, setKeyboardMapping] = useState<KeyboardMapping>(
    initialSettings.keyboard,
  )

  useEffect(() => {
    let active = true

    void loadPersistedSongs()
      .then((persistedSongs) => {
        if (!active) return
        const loadedSongs = [calibrationSong, ...persistedSongs]
        const selectedSongId = localStorage.getItem(STORAGE_KEYS.selectedSong)
        setSongs(loadedSongs)
        setCurrentSong(
          loadedSongs.find((candidate) => candidate.id === selectedSongId) ??
            calibrationSong,
        )
      })
      .catch((reason: unknown) => {
        if (!active) return
        setLibraryError(
          reason instanceof Error
            ? reason.message
            : 'The saved song library could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setLibraryReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void loadPersistedVisualAssets()
      .then((assets) => {
        if (active) setVisualAssets(assets)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setVisualAssetsError(
          reason instanceof Error
            ? reason.message
            : 'Saved artwork could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setVisualAssetsReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.calibration,
      JSON.stringify(calibration),
    )
  }, [calibration])

  useEffect(() => {
    localStorage.setItem(
      TIMING_PRESETS_STORAGE_KEY,
      JSON.stringify(timingPresetState),
    )
  }, [timingPresetState])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.highway,
      JSON.stringify(highwaySettings),
    )
  }, [highwaySettings])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.audio, JSON.stringify(audioSettings))
  }, [audioSettings])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.visualSettings,
      JSON.stringify(visualSettings),
    )
  }, [visualSettings])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.playPreferences,
      JSON.stringify(playPreferences),
    )
  }, [playPreferences])

  useEffect(() => {
    if (controllerMapping) {
      localStorage.setItem(
        STORAGE_KEYS.controller,
        JSON.stringify(controllerMapping),
      )
    } else {
      localStorage.removeItem(STORAGE_KEYS.controller)
    }
  }, [controllerMapping])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.keyboard,
      JSON.stringify(keyboardMapping),
    )
  }, [keyboardMapping])

  const setSong = useCallback((nextSong: LocalSong) => {
    setCurrentSong(nextSong)
    setSongs((current) => upsertSong(current, nextSong))
    localStorage.setItem(STORAGE_KEYS.selectedSong, nextSong.id)

    if (
      nextSong.kind === 'folder' &&
      nextSong.id !== 'bundled-techno-chiptale'
    ) {
      setLibrarySaving(true)
      setLibraryError('')
      void persistSong(nextSong)
        .catch((reason: unknown) => {
          setLibraryError(
            reason instanceof Error
              ? reason.message
              : 'The song could not be saved in this browser.',
          )
        })
        .finally(() => setLibrarySaving(false))
    }
  }, [])

  const addSongs = useCallback(async (nextSongs: LocalSong[]) => {
    if (nextSongs.length === 0) return
    setLibrarySaving(true)
    setLibraryError('')

    try {
      await Promise.all(nextSongs.map((nextSong) => persistSong(nextSong)))
      setSongs((current) =>
        nextSongs.reduce(
          (library, nextSong) => upsertSong(library, nextSong),
          current,
        ),
      )
      setCurrentSong(nextSongs[0])
      localStorage.setItem(STORAGE_KEYS.selectedSong, nextSongs[0].id)
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'The imported songs could not be saved in this browser.'
      setLibraryError(message)
      throw reason
    } finally {
      setLibrarySaving(false)
    }
  }, [])

  const addImportedSong = useCallback(async (nextSong: LocalSong) => {
    setLibraryError('')
    try {
      await persistSong(nextSong)
      setSongs((current) => upsertSong(current, nextSong))
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'The imported song could not be saved in this browser.'
      setLibraryError(message)
      throw reason
    }
  }, [])

  const removeSong = useCallback((songId: string) => {
    setSongs((current) => current.filter((song) => song.id !== songId))
    setCurrentSong((current) => {
      if (current.id !== songId) return current
      localStorage.setItem(STORAGE_KEYS.selectedSong, calibrationSong.id)
      return calibrationSong
    })
    setLibraryError('')
    void deletePersistedSong(songId).catch((reason: unknown) => {
      setLibraryError(
        reason instanceof Error
          ? reason.message
          : 'The saved song could not be removed.',
      )
    })
  }, [])

  const selectSong = useCallback(
    (songId: string) => {
      const selectedSong = songs.find((candidate) => candidate.id === songId)
      if (!selectedSong) return
      setCurrentSong(selectedSong)
      localStorage.setItem(STORAGE_KEYS.selectedSong, selectedSong.id)
    },
    [songs],
  )

  const selectTrack = useCallback((trackName: string) => {
    setCurrentSong((current) => {
      const chart = current.charts.find(
        (candidate) => candidate.trackName === trackName,
      )
      if (!chart) return current
      const nextSong = { ...current, chart }
      setSongs((library) => upsertSong(library, nextSong))
      if (
        nextSong.kind === 'folder' &&
        nextSong.id !== 'bundled-techno-chiptale'
      ) {
        void persistSong(nextSong).catch((reason: unknown) => {
          setLibraryError(
            reason instanceof Error
              ? reason.message
              : 'The selected chart could not be saved.',
          )
        })
      }
      return nextSong
    })
  }, [])

  const setCalibration = useCallback((next: CalibrationSettings) => {
    setCalibrationState(next)
    setTimingPresetState((current) =>
      updateActivePresetCalibration(current, next),
    )
  }, [])

  const activateTimingPresetById = useCallback(
    (presetId: string) => {
      const preset = timingPresetState.presets.find(
        (candidate) => candidate.id === presetId,
      )
      if (!preset) return
      setTimingPresetState((current) => ({
        ...current,
        activePresetId: presetId,
      }))
      setCalibrationState(preset.calibration)
    },
    [timingPresetState.presets],
  )

  const createTimingPreset = useCallback(
    (name?: string) => {
      const next = createTimingPresetState(
        timingPresetState,
        calibration,
        name,
      )
      setTimingPresetState(next)
      setCalibrationState(activeTimingPreset(next).calibration)
    },
    [calibration, timingPresetState],
  )

  const duplicateTimingPreset = useCallback(
    (presetId: string) => {
      const next = duplicateTimingPresetState(timingPresetState, presetId)
      setTimingPresetState(next)
      setCalibrationState(activeTimingPreset(next).calibration)
    },
    [timingPresetState],
  )

  const renameTimingPreset = useCallback(
    (presetId: string, name: string) => {
      setTimingPresetState((current) =>
        renameTimingPresetState(current, presetId, name),
      )
    },
    [],
  )

  const deleteTimingPreset = useCallback(
    (presetId: string) => {
      const next = removeTimingPreset(timingPresetState, presetId)
      setTimingPresetState(next)
      setCalibrationState(activeTimingPreset(next).calibration)
    },
    [timingPresetState],
  )

  const observeOutputLatency = useCallback((latencySeconds: number) => {
    setTimingPresetState((current) =>
      setLastObservedOutputLatency(current, latencySeconds),
    )
  }, [])

  const saveActiveTimingPresetLatency = useCallback(
    (latencySeconds: number) => {
      setTimingPresetState((current) =>
        setActivePresetMeasuredLatency(current, latencySeconds),
      )
    },
    [],
  )

  const addVisualAssets = useCallback(async (assets: VisualAsset[]) => {
    if (assets.length === 0) return
    setVisualAssetsSaving(true)
    setVisualAssetsError('')
    try {
      await persistVisualAssets(assets)
      setVisualAssets((current) => {
        const byId = new Map(current.map((asset) => [asset.id, asset]))
        for (const asset of assets) byId.set(asset.id, asset)
        return [...byId.values()]
      })
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'The artwork could not be saved in this browser.'
      setVisualAssetsError(message)
      throw reason
    } finally {
      setVisualAssetsSaving(false)
    }
  }, [])

  const removeVisualAsset = useCallback(async (assetId: string) => {
    setVisualAssetsSaving(true)
    setVisualAssetsError('')
    try {
      await deletePersistedVisualAsset(assetId)
      setVisualAssets((current) =>
        current.filter((asset) => asset.id !== assetId),
      )
      setVisualSettings((current) => ({
        ...current,
        backgroundSelection:
          current.backgroundSelection === assetId
            ? 'default'
            : current.backgroundSelection,
        highwaySelection:
          current.highwaySelection === assetId
            ? 'default'
            : current.highwaySelection,
      }))
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'The artwork could not be removed.'
      setVisualAssetsError(message)
      throw reason
    } finally {
      setVisualAssetsSaving(false)
    }
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      song,
      songs,
      setSong,
      addSongs,
      addImportedSong,
      selectSong,
      removeSong,
      selectTrack,
      useTimingLab: () => setSong(calibrationSong),
      libraryReady,
      librarySaving,
      libraryError,
      calibration,
      setCalibration,
      timingPresets: timingPresetState.presets,
      activeTimingPreset: activeTimingPreset(timingPresetState),
      timingOutputLatencyDifferenceMs:
        outputLatencyDifferenceMs(timingPresetState),
      activateTimingPreset: activateTimingPresetById,
      createTimingPreset,
      duplicateTimingPreset,
      renameTimingPreset,
      deleteTimingPreset,
      observeOutputLatency,
      saveActiveTimingPresetLatency,
      highwaySettings,
      setHighwaySettings,
      audioSettings,
      setAudioSettings,
      visualAssets,
      visualAssetsReady,
      visualAssetsSaving,
      visualAssetsError,
      addVisualAssets,
      removeVisualAsset,
      visualSettings,
      setVisualSettings,
      playPreferences,
      setPlayPreferences,
      controllerMapping,
      setControllerMapping,
      keyboardMapping,
      setKeyboardMapping,
    }),
    [
      song,
      songs,
      setSong,
      addSongs,
      addImportedSong,
      selectSong,
      removeSong,
      selectTrack,
      libraryReady,
      librarySaving,
      libraryError,
      calibration,
      setCalibration,
      timingPresetState,
      activateTimingPresetById,
      createTimingPreset,
      duplicateTimingPreset,
      renameTimingPreset,
      deleteTimingPreset,
      observeOutputLatency,
      saveActiveTimingPresetLatency,
      highwaySettings,
      audioSettings,
      visualAssets,
      visualAssetsReady,
      visualAssetsSaving,
      visualAssetsError,
      addVisualAssets,
      removeVisualAsset,
      visualSettings,
      playPreferences,
      controllerMapping,
      keyboardMapping,
    ],
  )

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}
