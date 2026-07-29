import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../components/AlbumArtwork'
import { useSongPreview } from '../hooks/useSongPreview'
import {
  authorizeGoogleDrive,
  connectGoogleDrive,
  isGoogleDriveConfigured,
  loadDriveLibrarySource,
  prepareGoogleDrive,
  saveDriveLibrarySource,
  syncGoogleDriveLibrary,
  type DriveLibrarySource,
} from '../lib/googleDrive'
import {
  discardPreparedGameplayAudioContext,
  prepareGameplayAudioContext,
} from '../lib/songAudio'
import { pickLoadingPhrase } from '../lib/loadingPhrases'
import { importCloneHeroFolder, loadBundledSong } from '../lib/songImport'
import {
  DIFFICULTIES,
  instrumentChoices,
  preferredInstrument,
  preferredTrack,
  trackLabel,
  type Difficulty,
  type InstrumentChoice,
  type TrackChoice,
} from '../lib/trackSelection'
import { useAppState } from '../state/AppState'
import type { LocalSong } from '../types/game'
import styles from './SongSelectView.module.scss'

type SortMode = 'title' | 'artist'
type SetupStep =
  | 'browse'
  | 'configure'
  | 'instrument'
  | 'difficulty'

function songSearchText(song: LocalSong): string {
  return `${song.chart.metadata.name} ${song.chart.metadata.artist} ${song.chart.metadata.charter}`.toLowerCase()
}

export function SongSelectView() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    song,
    songs,
    setSong,
    addSongs,
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
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [driveStatus, setDriveStatus] = useState('')
  const [driveSource, setDriveSource] = useState<DriveLibrarySource | null>(
    loadDriveLibrarySource,
  )
  const driveConfigured = isGoogleDriveConfigured()
  const [driveReady, setDriveReady] = useState(!driveConfigured)
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

  useEffect(() => {
    if (!driveConfigured) return
    let active = true
    void prepareGoogleDrive()
      .finally(() => {
        if (active) setDriveReady(true)
      })
    return () => {
      active = false
    }
  }, [driveConfigured])

  useEffect(
    () => () => {
      if (!gameplayHandoffRef.current) {
        discardPreparedGameplayAudioContext()
      }
    },
    [],
  )

  const openFolderPicker = () => {
    if (!inputRef.current) return
    inputRef.current.setAttribute('webkitdirectory', '')
    inputRef.current.click()
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    setError('')
    try {
      setSong(await importCloneHeroFolder(files))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const loadBundledSample = async () => {
    const existing = songs.find(
      (candidate) => candidate.id === 'bundled-techno-chiptale',
    )
    if (existing) {
      selectSong(existing.id)
      return
    }
    setImporting(true)
    setError('')
    try {
      setSong(await loadBundledSong())
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Sample song failed to load.',
      )
    } finally {
      setImporting(false)
    }
  }

  const syncDrive = async (chooseFolder = false) => {
    setImporting(true)
    setError('')
    setDriveStatus(
      chooseFolder || !driveSource
        ? 'Opening Google Drive…'
        : `Connecting to ${driveSource.name}…`,
    )

    try {
      let source = driveSource
      let accessToken: string
      if (chooseFolder || !source) {
        const connection = await connectGoogleDrive()
        if (!connection.source) {
          setDriveStatus('')
          return
        }
        source = connection.source
        accessToken = connection.accessToken
        saveDriveLibrarySource(source)
        setDriveSource(source)
      } else {
        accessToken = await authorizeGoogleDrive()
      }

      const result = await syncGoogleDriveLibrary(
        source,
        accessToken,
        songs,
        (progress) => setDriveStatus(progress.message),
      )
      await addSongs(result.songs)
      if (result.discovered === 0) {
        setDriveStatus(
          `No compatible song folders were found in ${source.name}.`,
        )
      } else if (result.songs.length === 0) {
        setDriveStatus(
          `${source.name} is up to date · ${result.unchanged} songs checked.`,
        )
      } else {
        setDriveStatus(
          `Added or updated ${result.songs.length} songs` +
            (result.unchanged
              ? ` · ${result.unchanged} already current.`
              : '.'),
        )
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Google Drive sync failed.',
      )
      setDriveStatus('')
    } finally {
      setImporting(false)
    }
  }

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
      <main className={styles.setupPage} data-step={setupStep}>
        <div className={styles.setupBackdrop} aria-hidden="true">
          <AlbumArtwork song={selectedSong} />
        </div>

        <header className={styles.setupHeader}>
          <button
            type="button"
            data-controller-back
            onClick={closeSetup}
          >
            <span aria-hidden="true">←</span>
            {setupStep === 'configure' ? 'Song library' : 'Back'}
          </button>
          <div className={styles.setupTitle}>
            <h1>{selectedSong.chart.metadata.name}</h1>
            <p>{selectedSong.chart.metadata.artist}</p>
            <small data-preview-status={previewStatus}>
              {previewStatus === 'playing'
                ? '● Preview playing'
                : previewStatus === 'loading'
                  ? 'Preparing preview…'
                  : previewStatus === 'waiting'
                    ? 'Press a key to hear preview'
                    : 'Fretline setlist'}
            </small>
          </div>
          <span className={styles.setupVersion}>Fretline</span>
        </header>

        <section className={styles.playerSetup} aria-label="Player setup">
            <div className={styles.playerCard}>
              <div className={styles.playerName}>Guest</div>
              <div className={styles.playerSummary}>
                <i aria-hidden="true">♬</i>
                <span>
                  <strong>{selectedTrack?.difficulty}</strong>
                  <small>{selectedInstrument?.label}</small>
                </span>
              </div>

              {setupStep === 'configure' && (
                <div className={styles.playerMenu}>
                  <button
                    type="button"
                    data-controller-nav-item
                    data-controller-default
                    onClick={() => {
                      if (selectedTrack) beginLoading(selectedTrack)
                    }}
                  >
                    <span>Ready</span>
                    <b aria-hidden="true">→</b>
                  </button>
                  <button
                    type="button"
                    data-controller-nav-item
                    onClick={() => setSetupStep('instrument')}
                  >
                    <span>Instrument</span>
                    <strong>{selectedInstrument?.label}</strong>
                  </button>
                  <button
                    type="button"
                    data-controller-nav-item
                    onClick={() => setSetupStep('difficulty')}
                  >
                    <span>Difficulty</span>
                    <strong>{selectedTrack?.difficulty}</strong>
                  </button>
                  <div className={styles.disabledMenuRow} aria-disabled="true">
                    <span>Modifiers</span>
                    <strong>None</strong>
                  </div>
                </div>
              )}

              {setupStep === 'instrument' && (
                <div className={styles.inlinePicker}>
                  <p>Instrument</p>
                  {instruments.map((instrument) => {
                    const active = instrument.id === selectedInstrument?.id
                    return (
                      <button
                        type="button"
                        key={instrument.id}
                        data-controller-nav-item
                        data-controller-default={active || undefined}
                        data-active={active}
                        onClick={() => chooseInstrument(instrument)}
                      >
                        <span>
                          <strong>{instrument.label}</strong>
                          <small>
                            {instrument.tracks.length}{' '}
                            {instrument.tracks.length === 1
                              ? 'difficulty'
                              : 'difficulties'}{' '}
                            charted
                          </small>
                        </span>
                        <b aria-hidden="true">{active ? '●' : '○'}</b>
                      </button>
                    )
                  })}
                </div>
              )}

              {setupStep === 'difficulty' && selectedInstrument && (
                <div className={styles.inlinePicker}>
                  <p>Difficulty</p>
                  {DIFFICULTIES.map((difficulty, index) => {
                    const track = selectedInstrument.tracks.find(
                      (candidate) => candidate.difficulty === difficulty,
                    )
                    const active = difficulty === selectedTrack?.difficulty
                    return (
                      <button
                        type="button"
                        key={difficulty}
                        disabled={!track}
                        data-controller-nav-item={track ? true : undefined}
                        data-controller-default={
                          track && active ? true : undefined
                        }
                        data-active={active}
                        onClick={() => {
                          if (track) chooseDifficulty(track)
                        }}
                      >
                        <span>
                          <strong>{difficulty}</strong>
                          <small>
                            {track
                              ? `${track.chart.notes.length.toLocaleString()} notes`
                              : 'Not charted'}
                          </small>
                        </span>
                        <b aria-label={`${index + 1} of 4 intensity`}>
                          {Array.from({ length: 4 }, (_, meterIndex) => (
                            <i
                              key={meterIndex}
                              data-filled={meterIndex <= index}
                            />
                          ))}
                        </b>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
        </section>

        <footer className={styles.setupControls}>
          <span><i data-color="green" /> Select</span>
          <span><i data-color="red" /> Back</span>
          <span><b>↕</b> Strum to navigate</span>
        </footer>
      </main>
    )
  }

  return (
    <main className={styles.page}>
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
