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
  deletePersistedVisualAsset,
  deletePersistedSong,
  loadPersistedVisualAssets,
  loadPersistedSongs,
  persistVisualAssets,
  persistSong,
} from '../lib/songLibrary'
import { normalizeKeyboardMapping } from '../lib/keyboardMapping'
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

const SETTINGS_KEY = 'fretline:calibration'
const HIGHWAY_KEY = 'fretline:highway'
const AUDIO_KEY = 'fretline:audio'
const VISUAL_SETTINGS_KEY = 'fretline:visual-settings'
const PLAY_PREFERENCES_KEY = 'fretline:play-preferences'
const CONTROLLER_KEY = 'fretline:controller'
const KEYBOARD_KEY = 'fretline:keyboard'
const SELECTED_SONG_KEY = 'fretline:selected-song'

const defaultCalibration: CalibrationSettings = {
  inputOffsetMs: 0,
  videoOffsetMs: 0,
}

const defaultHighwaySettings: HighwaySettings = {
  noteSpeed: 12,
  length: 55,
  missFeedback: true,
}

const defaultAudioSettings: AudioSettings = {
  homeMusicMuted: false,
}

const defaultVisualSettings: VisualSettings = {
  backgroundSelection: 'default',
  highwaySelection: 'default',
  backgroundDim: 42,
  highwayOpacity: 72,
  backgroundDriveFolder: null,
  highwayDriveFolder: null,
}

const defaultPlayPreferences: PlayPreferences = {
  difficulty: 'Expert',
  instrumentId: 'Single',
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function loadHighwaySettings(): HighwaySettings {
  const value = loadStored<unknown>(HIGHWAY_KEY, defaultHighwaySettings)
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

function loadVisualSettings(): VisualSettings {
  const value = loadStored<Partial<VisualSettings>>(
    VISUAL_SETTINGS_KEY,
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

const AppStateContext = createContext<AppStateValue | null>(null)

function upsertSong(songs: LocalSong[], nextSong: LocalSong): LocalSong[] {
  const existingIndex = songs.findIndex((song) => song.id === nextSong.id)
  if (existingIndex === -1) return [...songs, nextSong]

  return songs.map((song, index) =>
    index === existingIndex ? nextSong : song,
  )
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [song, setCurrentSong] = useState<LocalSong>(calibrationSong)
  const [songs, setSongs] = useState<LocalSong[]>([calibrationSong])
  const [libraryReady, setLibraryReady] = useState(false)
  const [librarySaving, setLibrarySaving] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [calibration, setCalibration] = useState<CalibrationSettings>(() =>
    loadStored(SETTINGS_KEY, defaultCalibration),
  )
  const [highwaySettings, setHighwaySettings] = useState<HighwaySettings>(() =>
    loadHighwaySettings(),
  )
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    loadStored(AUDIO_KEY, defaultAudioSettings),
  )
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([])
  const [visualAssetsReady, setVisualAssetsReady] = useState(false)
  const [visualAssetsSaving, setVisualAssetsSaving] = useState(false)
  const [visualAssetsError, setVisualAssetsError] = useState('')
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(() =>
    loadVisualSettings(),
  )
  const [playPreferences, setPlayPreferences] = useState<PlayPreferences>(() =>
    loadStored(PLAY_PREFERENCES_KEY, defaultPlayPreferences),
  )
  const [controllerMapping, setControllerMapping] =
    useState<ControllerMapping | null>(() =>
      loadStored<ControllerMapping | null>(CONTROLLER_KEY, null),
    )
  const [keyboardMapping, setKeyboardMapping] = useState<KeyboardMapping>(() =>
    normalizeKeyboardMapping(loadStored<unknown>(KEYBOARD_KEY, null)),
  )

  useEffect(() => {
    let active = true

    void loadPersistedSongs()
      .then((persistedSongs) => {
        if (!active) return
        const loadedSongs = [calibrationSong, ...persistedSongs]
        const selectedSongId = localStorage.getItem(SELECTED_SONG_KEY)
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(calibration))
  }, [calibration])

  useEffect(() => {
    localStorage.setItem(HIGHWAY_KEY, JSON.stringify(highwaySettings))
  }, [highwaySettings])

  useEffect(() => {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(audioSettings))
  }, [audioSettings])

  useEffect(() => {
    localStorage.setItem(
      VISUAL_SETTINGS_KEY,
      JSON.stringify(visualSettings),
    )
  }, [visualSettings])

  useEffect(() => {
    localStorage.setItem(
      PLAY_PREFERENCES_KEY,
      JSON.stringify(playPreferences),
    )
  }, [playPreferences])

  useEffect(() => {
    if (controllerMapping) {
      localStorage.setItem(CONTROLLER_KEY, JSON.stringify(controllerMapping))
    } else {
      localStorage.removeItem(CONTROLLER_KEY)
    }
  }, [controllerMapping])

  useEffect(() => {
    localStorage.setItem(KEYBOARD_KEY, JSON.stringify(keyboardMapping))
  }, [keyboardMapping])

  const setSong = useCallback((nextSong: LocalSong) => {
    setCurrentSong(nextSong)
    setSongs((current) => upsertSong(current, nextSong))
    localStorage.setItem(SELECTED_SONG_KEY, nextSong.id)

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
      localStorage.setItem(SELECTED_SONG_KEY, nextSongs[0].id)
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
      localStorage.setItem(SELECTED_SONG_KEY, calibrationSong.id)
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
      localStorage.setItem(SELECTED_SONG_KEY, selectedSong.id)
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
