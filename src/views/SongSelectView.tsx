import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../components/AlbumArtwork'
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
import { importCloneHeroFolder, loadBundledSong } from '../lib/songImport'
import { useAppState } from '../state/AppState'
import type { LocalSong } from '../types/game'
import styles from './SongSelectView.module.scss'

type SortMode = 'title' | 'artist'

function trackLabel(trackName: string): string {
  return trackName
    .replace(/^Easy/, 'Easy · ')
    .replace(/^Medium/, 'Medium · ')
    .replace(/^Hard/, 'Hard · ')
    .replace(/^Expert/, 'Expert · ')
    .replace('DoubleGuitar', 'Co-op Guitar')
    .replace('DoubleBass', 'Bass')
    .replace('DoubleRhythm', 'Rhythm')
    .replace('Single', 'Guitar')
}

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
    selectTrack,
    libraryReady,
    librarySaving,
    libraryError,
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

  const playableSongs = useMemo(
    () => songs.filter((candidate) => candidate.kind === 'folder'),
    [songs],
  )
  const selectedSong =
    song.kind === 'folder' ? song : playableSongs[0] ?? null
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

  useEffect(() => {
    if (libraryReady && song.kind !== 'folder' && playableSongs[0]) {
      selectSong(playableSongs[0].id)
    }
  }, [libraryReady, playableSongs, selectSong, song.kind])

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

  const playSelected = () => {
    if (!selectedSong) return
    selectSong(selectedSong.id)
    navigate('/play')
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
                  onClick={() => selectSong(candidate.id)}
                  onFocus={() => selectSong(candidate.id)}
                  onDoubleClick={() => {
                    selectSong(candidate.id)
                    navigate('/play')
                  }}
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
              <label className={styles.trackPicker}>
                <span>Difficulty & instrument</span>
                <select
                  value={selectedSong.chart.trackName}
                  onChange={(event) => selectTrack(event.target.value)}
                >
                  {selectedSong.charts.map((chart) => (
                    <option key={chart.trackName} value={chart.trackName}>
                      {trackLabel(chart.trackName)} · {chart.notes.length} notes
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.playButton}
                  data-controller-target="play-song"
                  onClick={playSelected}
                >
                  Play song
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
