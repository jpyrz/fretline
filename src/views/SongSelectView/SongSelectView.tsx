import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../../components/AlbumArtwork'
import { BackIconButton } from '../../components/BackIconButton/BackIconButton'
import {
  discardPreparedGameplayAudioContext,
  prepareGameplayAudioContext,
} from '../../lib/songAudio'
import { pickLoadingPhrase } from '../../lib/loadingPhrases'
import {
  touchInputAvailable,
  type PlayInputMode,
} from '../../lib/inputMode'
import {
  instrumentChoices,
  preferredInstrument,
  preferredTrack,
  trackLabel,
  type Difficulty,
  type InstrumentChoice,
  type TrackChoice,
} from '../../lib/trackSelection'
import { useAppState } from '../../state/AppState'
import type { LocalSong } from '../../types/game'
import {
  PlayerSetup,
  type SetupStep,
} from './components/PlayerSetup'
import { useSongPreview } from './hooks/useSongPreview'
import styles from './SongSelectView.module.scss'

type SortMode = 'title' | 'artist'

function songSearchText(song: LocalSong): string {
  return `${song.chart.metadata.name} ${song.chart.metadata.artist} ${song.chart.metadata.charter}`.toLowerCase()
}

export function SongSelectView() {
  const navigate = useNavigate()
  const {
    song,
    songs,
    selectSong,
    libraryReady,
    playPreferences,
    setPlayPreferences,
    controllerMapping,
    selectTrack,
  } = useAppState()
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('title')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [, setError] = useState('')
  const [highlightedSongId, setHighlightedSongId] = useState<string | null>(
    song.kind === 'folder' ? song.id : null,
  )
  const [setupStep, setSetupStep] = useState<SetupStep>('browse')
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(
    playPreferences.instrumentId,
  )
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(
    playPreferences.difficulty,
  )
  const [selectedInputMode, setSelectedInputMode] =
    useState<PlayInputMode>(playPreferences.inputMode)
  const tapAvailable = touchInputAvailable()
  const gameplayHandoffRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filterControlRef = useRef<HTMLDivElement>(null)

  const playableSongs = useMemo(
    () => songs.filter((candidate) => candidate.kind === 'folder'),
    [songs],
  )
  const visibleSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return playableSongs
      .filter(
        (candidate) =>
          !normalizedQuery ||
          songSearchText(candidate).includes(normalizedQuery),
      )
      .sort((a, b) => {
        const first =
          sortMode === 'title'
            ? a.chart.metadata.name
            : a.chart.metadata.artist
        const second =
          sortMode === 'title'
            ? b.chart.metadata.name
            : b.chart.metadata.artist
        return first.localeCompare(second)
      })
  }, [playableSongs, query, sortMode])
  const selectedSong =
    playableSongs.find((candidate) => candidate.id === highlightedSongId) ??
    (song.kind === 'folder'
      ? playableSongs.find((candidate) => candidate.id === song.id)
      : null) ??
    visibleSongs[0] ??
    playableSongs[0] ??
    null
  const instruments = useMemo(
    () => (selectedSong ? instrumentChoices(selectedSong) : []),
    [selectedSong],
  )
  const selectedInstrument =
    instruments.find(
      (instrument) => instrument.id === selectedInstrumentId,
    ) ?? preferredInstrument(instruments, playPreferences.instrumentId)
  const selectedTrack = selectedInstrument
    ? selectedInstrument.tracks.find(
        (track) => track.difficulty === selectedDifficulty,
      ) ?? preferredTrack(selectedInstrument, playPreferences.difficulty)
    : null
  const previewStatus = useSongPreview(
    selectedSong,
    Boolean(selectedSong),
  )

  useEffect(() => {
    if (
      libraryReady &&
      visibleSongs.length > 0 &&
      !visibleSongs.some((candidate) => candidate.id === highlightedSongId)
    ) {
      setHighlightedSongId(visibleSongs[0].id)
    }
  }, [highlightedSongId, libraryReady, visibleSongs])

  useEffect(() => {
    if (!searchOpen) return
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [searchOpen])

  useEffect(() => {
    if (!filtersOpen) return
    const focusFrame = requestAnimationFrame(() => {
      filterControlRef.current
        ?.querySelector<HTMLElement>('[role="menuitemradio"]')
        ?.focus({ preventScroll: true })
    })
    const closeFilters = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !filterControlRef.current?.contains(event.target)
      ) {
        setFiltersOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeFilters)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', closeFilters)
    }
  }, [filtersOpen])

  useEffect(() => {
    const closeOverlays = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (filtersOpen) {
        setFiltersOpen(false)
      } else if (searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', closeOverlays)
    return () => window.removeEventListener('keydown', closeOverlays)
  }, [filtersOpen, searchOpen])

  useEffect(() => {
    if (setupStep === 'browse') return
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-controller-default]')
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    selectedDifficulty,
    selectedInputMode,
    selectedInstrumentId,
    setupStep,
  ])

  useEffect(
    () => () => {
      if (!gameplayHandoffRef.current) {
        discardPreparedGameplayAudioContext()
      }
    },
    [],
  )

  const openSetup = (targetSong: LocalSong | null = selectedSong) => {
    if (!targetSong) return
    const availableInstruments = instrumentChoices(targetSong)
    const instrument = preferredInstrument(
      availableInstruments,
      playPreferences.instrumentId,
    )
    if (!instrument) {
      setError('This song does not contain a supported five-fret track.')
      return
    }
    const track = preferredTrack(instrument, playPreferences.difficulty)

    setHighlightedSongId(targetSong.id)
    selectSong(targetSong.id)
    setSelectedInstrumentId(instrument.id)
    setSelectedDifficulty(track.difficulty)
    setSelectedInputMode(playPreferences.inputMode)
    setSetupStep('configure')
  }

  const chooseInputMode = (inputMode: PlayInputMode) => {
    if (inputMode === 'tap' && !tapAvailable) return
    setSelectedInputMode(inputMode)
    setSetupStep('configure')
  }

  const chooseInstrument = (instrument: InstrumentChoice) => {
    const track = preferredTrack(instrument, playPreferences.difficulty)
    setSelectedInstrumentId(instrument.id)
    setSelectedDifficulty(track.difficulty)
    setSetupStep('configure')
  }

  const chooseDifficulty = (track: TrackChoice) => {
    setSelectedDifficulty(track.difficulty)
    setSetupStep('configure')
  }

  const closeSetup = () => {
    if (
      setupStep === 'input' ||
      setupStep === 'instrument' ||
      setupStep === 'difficulty'
    ) {
      setSetupStep('configure')
    } else {
      setSetupStep('browse')
    }
  }

  const beginLoading = (track: TrackChoice) => {
    if (!selectedSong || !selectedInstrument) return
    setSelectedDifficulty(track.difficulty)
    const preferredDifficultyAvailable = selectedInstrument.tracks.some(
      (candidate) =>
        candidate.difficulty === playPreferences.difficulty,
    )
    setPlayPreferences({
      difficulty: preferredDifficultyAvailable
        ? track.difficulty
        : playPreferences.difficulty,
      instrumentId: selectedInstrument.id,
      inputMode: selectedInputMode,
    })
    selectTrack(track.chart.trackName)
    gameplayHandoffRef.current = false
    prepareGameplayAudioContext()
    gameplayHandoffRef.current = true
    navigate('/play', {
      state: {
        autoStart: true,
        loadingPhrase: pickLoadingPhrase(),
        inputMode: selectedInputMode,
      },
    })
  }

  if (setupStep !== 'browse' && selectedSong) {
    return (
      <PlayerSetup
        song={selectedSong}
        step={setupStep}
        previewStatus={previewStatus}
        instruments={instruments}
        selectedInstrument={selectedInstrument}
        selectedTrack={selectedTrack}
        selectedInputMode={selectedInputMode}
        touchAvailable={tapAvailable}
        controllerConfigured={controllerMapping !== null}
        onBack={closeSetup}
        onReady={beginLoading}
        onShowInputModes={() => setSetupStep('input')}
        onShowInstruments={() => setSetupStep('instrument')}
        onShowDifficulties={() => setSetupStep('difficulty')}
        onChooseInputMode={chooseInputMode}
        onChooseInstrument={chooseInstrument}
        onChooseDifficulty={chooseDifficulty}
      />
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <BackIconButton
          label="Main menu"
          onClick={() => navigate('/')}
        />
        <div className={styles.headerTitle}>
          <p>Quick Play</p>
          <strong>
            {libraryReady
              ? `${playableSongs.length} ${
                  playableSongs.length === 1 ? 'song' : 'songs'
                }`
              : 'Loading songs…'}
          </strong>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            data-controller-action="blue"
            data-active={searchOpen || Boolean(query)}
            aria-label={searchOpen ? 'Close search' : 'Search songs'}
            aria-expanded={searchOpen}
            onClick={() => {
              setFiltersOpen(false)
              setSearchOpen((current) => !current)
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4.5 4.5" />
            </svg>
          </button>
          <div className={styles.filterControl} ref={filterControlRef}>
            <button
              type="button"
              data-controller-action="yellow"
              data-active={filtersOpen || sortMode !== 'title'}
              aria-label="Sort and filter songs"
              aria-expanded={filtersOpen}
              onClick={() => {
                setSearchOpen(false)
                setFiltersOpen((current) => !current)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </button>
            {filtersOpen && (
              <div
                className={styles.filterMenu}
                role="menu"
                aria-label="Song filters"
              >
                <p>Sort songs</p>
                {(['title', 'artist'] as SortMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    role="menuitemradio"
                    aria-checked={sortMode === mode}
                    data-controller-nav-item
                    onClick={() => {
                      setSortMode(mode)
                      setFiltersOpen(false)
                    }}
                  >
                    <span>{mode === 'title' ? 'Title' : 'Artist'}</span>
                    <i aria-hidden="true">{sortMode === mode ? '✓' : ''}</i>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {searchOpen && (
          <div className={styles.searchOverlay} role="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4.5 4.5" />
            </svg>
            <label>
              <span className="sr-only">Search songs</span>
              <input
                ref={searchInputRef}
                value={query}
                placeholder="Search songs, artists, or charters"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
      </header>

      <section className={styles.browser}>
        <div className={styles.songListPanel}>
          <div className={styles.listHeading}>
            <span>
              {query ? `Search results` : 'All songs'}
            </span>
            <small>{visibleSongs.length}</small>
          </div>
          <div className={styles.songList}>
            {visibleSongs.map((candidate, index) => {
              const selected = candidate.id === selectedSong?.id
              return (
                <button
                  type="button"
                  key={candidate.id}
                  className={styles.songRow}
                  data-selected={selected}
                  data-controller-default={selected || undefined}
                  data-controller-nav-item
                  data-controller-activate="play-song"
                  onClick={() => setHighlightedSongId(candidate.id)}
                  onFocus={() => setHighlightedSongId(candidate.id)}
                  onDoubleClick={() => openSetup(candidate)}
                >
                  <span className={styles.rowNumber}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <AlbumArtwork song={candidate} compact />
                  <span className={styles.rowCopy}>
                    <strong>{candidate.chart.metadata.name}</strong>
                    <small>{candidate.chart.metadata.artist}</small>
                  </span>
                  <span className={styles.rowMeta}>
                    <small>{trackLabel(candidate.chart.trackName)}</small>
                    <strong>{candidate.chart.notes.length}</strong>
                  </span>
                </button>
              )
            })}
            {libraryReady && visibleSongs.length === 0 && (
              <div className={styles.empty}>
                <strong>
                  {playableSongs.length === 0
                    ? 'Your setlist is empty'
                    : 'No songs match that search'}
                </strong>
                <span>
                  {playableSongs.length === 0
                    ? 'Open Settings → Library to add a Clone Hero folder or connect Google Drive.'
                    : 'Try a song title, artist, or charter.'}
                </span>
                {playableSongs.length === 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/settings?section=library')}
                  >
                    Open library settings
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className={styles.songPreview}>
          {selectedSong ? (
            <>
              <AlbumArtwork song={selectedSong} />
              <div className={styles.previewTitle}>
                <h1>{selectedSong.chart.metadata.name}</h1>
                <p>{selectedSong.chart.metadata.artist}</p>
              </div>
              <dl>
                <div>
                  <dt>Charter</dt>
                  <dd>{selectedSong.chart.metadata.charter}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{selectedSong.chart.notes.length}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {selectedSong.source?.type === 'google-drive'
                      ? 'Google Drive'
                      : 'Local library'}
                  </dd>
                </div>
              </dl>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.playButton}
                  data-controller-target="play-song"
                  onClick={() => openSetup()}
                >
                  Choose part
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <span>♪</span>
              <strong>No song selected</strong>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}
