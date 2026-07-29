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
  deletePersistedSong,
  loadPersistedSongs,
  persistSong,
} from '../lib/songLibrary'
import { normalizeKeyboardMapping } from '../lib/keyboardMapping'
import type { PlayPreferences } from '../lib/trackSelection'
import type {
  CalibrationSettings,
  ControllerMapping,
  HighwaySettings,
  KeyboardMapping,
  LocalSong,
} from '../types/game'

interface AppStateValue {
  song: LocalSong
  songs: LocalSong[]
  setSong: (song: LocalSong) => void
  addSongs: (songs: LocalSong[]) => Promise<void>
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
  playPreferences: PlayPreferences
  setPlayPreferences: (preferences: PlayPreferences) => void
  controllerMapping: ControllerMapping | null
  setControllerMapping: (mapping: ControllerMapping | null) => void
  keyboardMapping: KeyboardMapping
  setKeyboardMapping: (mapping: KeyboardMapping) => void
}

const SETTINGS_KEY = 'fretline:calibration'
const HIGHWAY_KEY = 'fretline:highway'
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
    loadStored(HIGHWAY_KEY, defaultHighwaySettings),
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(calibration))
  }, [calibration])

  useEffect(() => {
    localStorage.setItem(HIGHWAY_KEY, JSON.stringify(highwaySettings))
  }, [highwaySettings])

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

  const value = useMemo<AppStateValue>(
    () => ({
      song,
      songs,
      setSong,
      addSongs,
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
      selectSong,
      removeSong,
      selectTrack,
      libraryReady,
      librarySaving,
      libraryError,
      calibration,
      highwaySettings,
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
