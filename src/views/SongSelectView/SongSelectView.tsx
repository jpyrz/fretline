import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../../components/AlbumArtwork'
import {
  discardPreparedGameplayAudioContext,
  prepareGameplayAudioContext,
} from '../../lib/songAudio'
import { pickLoadingPhrase } from '../../lib/loadingPhrases'
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
import { useSongLibraryActions } from './hooks/useSongLibraryActions'
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
    setSong,
    addImportedSong,
    selectSong,
    removeSong,
    libraryReady,
    librarySaving,
    libraryError,
    playPreferences,
    setPlayPreferences,
    selectTrack,
  } = useAppState()
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('title')
  const [manageOpen, setManageOpen] = useState(false)
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
  const gameplayHandoffRef = useRef(false)
  const {
    inputRef,
    importing,
    error,
    setError,
    driveStatus,
    driveSource,
    driveConfigured,
    driveReady,
    openFolderPicker,
    handleFiles,
    loadBundledSample,
    syncDrive,
  } = useSongLibraryActions({
    songs,
    libraryReady,
    setSong,
    selectSong,
    addImportedSong,
  })

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
    if (setupStep === 'browse') return
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-controller-default]')
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedDifficulty, selectedInstrumentId, setupStep])

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
    if (setupStep === 'instrument' || setupStep === 'difficulty') {
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
    })
    selectTrack(track.chart.trackName)
    gameplayHandoffRef.current = false
    prepareGameplayAudioContext()
    gameplayHandoffRef.current = true
    navigate('/play', {
      state: {
        autoStart: true,
        loadingPhrase: pickLoadingPhrase(),
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
        onBack={closeSetup}
        onReady={beginLoading}
        onShowInstruments={() => setSetupStep('instrument')}
        onShowDifficulties={() => setSetupStep('difficulty')}
        onChooseInstrument={chooseInstrument}
        onChooseDifficulty={chooseDifficulty}
      />
    )
  }

  return (
    <main
      className={styles.page}
      data-manager-open={manageOpen || undefined}
    >
      <header className={styles.header}>
        <button
          type="button"
          data-controller-back
          onClick={() => navigate('/')}
        >
          <span aria-hidden="true">←</span>
          Main menu
        </button>
        <div>
          <p>Quick Play</p>
          <strong>
            {libraryReady
              ? `${playableSongs.length} ${
                  playableSongs.length === 1 ? 'song' : 'songs'
                }`
              : 'Loading songs…'}
          </strong>
        </div>
      </header>

      <section className={styles.commandBar} aria-label="Song browser controls">
        <div><i data-color="green" /> Select & play</div>
        <div><i data-color="red" /> Back</div>
        <div><i data-color="yellow" /> Sort</div>
        <div><i data-color="blue" /> Search</div>
        <div><i data-color="orange" /> Library</div>
      </section>

      <section className={styles.toolbar}>
        <label>
          <span className="sr-only">Search songs</span>
          <b aria-hidden="true">⌕</b>
          <input
            data-controller-action="blue"
            value={query}
            placeholder="Search songs, artists, or charters"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          data-controller-action="yellow"
          onClick={() =>
            setSortMode((current) =>
              current === 'title' ? 'artist' : 'title',
            )
          }
        >
          Sort: {sortMode === 'title' ? 'Title' : 'Artist'}
        </button>
        <button
          type="button"
          data-controller-action="orange"
          data-active={manageOpen}
          onClick={() => setManageOpen((current) => !current)}
        >
          Manage library
        </button>
      </section>

      {manageOpen && (
        <section className={styles.libraryManager}>
          <div>
            <p>Song sources</p>
            <span>
              Songs are copied into this browser before play, so network speed
              never affects timing.
            </span>
          </div>
          <div className={styles.managerActions}>
            <button
              type="button"
              disabled={importing || !libraryReady}
              onClick={openFolderPicker}
            >
              Add local folder
            </button>
            <button
              type="button"
              disabled={importing || !libraryReady}
              onClick={() => void loadBundledSample()}
            >
              Free sample
            </button>
            <button
              type="button"
              disabled={
                importing ||
                !libraryReady ||
                !driveConfigured ||
                !driveReady
              }
              onClick={() => void syncDrive(false)}
            >
              {driveSource ? 'Sync Google Drive' : 'Connect Google Drive'}
            </button>
            {driveSource && driveConfigured && (
              <button
                type="button"
                disabled={importing || !libraryReady}
                onClick={() => void syncDrive(true)}
              >
                Change Drive folder
              </button>
            )}
          </div>
          {(driveStatus || librarySaving) && (
            <p className={styles.status} aria-live="polite">
              {librarySaving ? 'Saving songs to this device…' : driveStatus}
            </p>
          )}
          {(error || libraryError) && (
            <p className={styles.error}>{error || libraryError}</p>
          )}
        </section>
      )}

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
                    ? 'Open Manage library to add a Clone Hero folder or connect Google Drive.'
                    : 'Try a song title, artist, or charter.'}
                </span>
                {playableSongs.length === 0 && (
                  <button type="button" onClick={() => setManageOpen(true)}>
                    Manage library
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
              <div
                className={styles.previewStatus}
                data-status={previewStatus}
              >
                <i aria-hidden="true" />
                <span>
                  {previewStatus === 'playing'
                    ? 'Preview playing'
                    : previewStatus === 'loading'
                      ? 'Preparing preview'
                      : previewStatus === 'waiting'
                        ? 'Press a key to hear preview'
                        : previewStatus === 'error'
                          ? 'Preview unavailable'
                          : trackLabel(selectedSong.chart.trackName)}
                </span>
              </div>
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
                {selectedSong.id !== 'bundled-techno-chiptale' && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeSong(selectedSong.id)}
                  >
                    Remove from device
                  </button>
                )}
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

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </main>
  )
}
