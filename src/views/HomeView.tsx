import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ControllerSetup } from '../components/ControllerSetup'
import { importCloneHeroFolder, loadBundledSong } from '../lib/songImport'
import { useAppState } from '../state/AppState'
import styles from './HomeView.module.scss'

export function HomeView() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    song,
    songs,
    setSong,
    selectSong,
    removeSong,
    selectTrack,
    libraryReady,
    librarySaving,
    libraryError,
    calibration,
    setCalibration,
    highwaySettings,
    setHighwaySettings,
    controllerMapping,
    setControllerMapping,
  } = useAppState()
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const openFolderPicker = () => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '')
      inputRef.current.click()
    }
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
    const existingSample = songs.find(
      (candidate) => candidate.id === 'bundled-techno-chiptale',
    )
    if (existingSample) {
      selectSong(existingSample.id)
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Fretline home">
          <span>F</span>
          Fretline
        </a>
        <p>
          Local timing prototype <strong>v0.1</strong>
        </p>
      </header>

      <section className={styles.hero}>
        <div>
          <p className="eyebrow">Browser rhythm lab</p>
          <h1>Find the beat.<br />Measure the truth.</h1>
          <p className={styles.lede}>
            A backend-free five-fret prototype driven by the browser&apos;s
            audio-output clock. Build a private on-device song library from
            compatible Clone Hero folders and play without uploading anything.
          </p>
        </div>
        <div className={styles.signal} aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <i
              key={index}
              style={{
                height: `${18 + ((index * 19) % 70)}%`,
                animationDelay: `${index * -48}ms`,
              }}
            />
          ))}
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.songPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">On-device collection</p>
              <h2>Song library</h2>
            </div>
            <span>
              {!libraryReady
                ? 'Loading library…'
                : librarySaving
                  ? 'Saving locally…'
                  : `${songs.length} available`}
            </span>
          </div>

          <div className={styles.songLibrary}>
            {songs.map((librarySong) => {
              const selected = librarySong.id === song.id
              const removable =
                librarySong.kind === 'folder' &&
                librarySong.id !== 'bundled-techno-chiptale'

              return (
                <article
                  key={librarySong.id}
                  className={styles.songCard}
                  data-selected={selected}
                >
                  <div className={styles.album}>
                    <span>
                      {librarySong.kind === 'calibration'
                        ? '120'
                        : librarySong.id === 'bundled-techno-chiptale'
                          ? 'CC0'
                          : 'CH'}
                    </span>
                    <small>
                      {librarySong.kind === 'calibration' ? 'BPM' : '.chart'}
                    </small>
                  </div>
                  <div className={styles.songDetails}>
                    <p>
                      {librarySong.kind === 'calibration'
                        ? 'Generated locally'
                        : librarySong.folderName}
                    </p>
                    <h3>{librarySong.chart.metadata.name}</h3>
                    <span>
                      {librarySong.chart.metadata.artist} ·{' '}
                      {librarySong.chart.trackName} ·{' '}
                      {librarySong.chart.notes.length} notes
                    </span>
                  </div>
                  <div className={styles.songActions}>
                    {selected ? (
                      <span className={styles.selectedBadge}>Selected</span>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => selectSong(librarySong.id)}
                      >
                        Select
                      </button>
                    )}
                    {removable && (
                      <button
                        type="button"
                        className="button ghost"
                        aria-label={`Remove ${librarySong.chart.metadata.name} from library`}
                        onClick={() => removeSong(librarySong.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className={styles.libraryActions}>
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={importing || !libraryReady}
                onClick={openFolderPicker}
              >
                Add song folder
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={importing || !libraryReady}
                onClick={() => void loadBundledSample()}
              >
                {songs.some(
                  (candidate) => candidate.id === 'bundled-techno-chiptale',
                )
                  ? 'Select free sample'
                  : 'Add free sample'}
              </button>
            </div>
            <small>
              Imported audio is stored only in this browser. Removing a song
              does not touch its original folder.
            </small>
          </div>

          {song.charts.length > 1 && (
            <label className={styles.trackPicker}>
              <span>Difficulty and instrument</span>
              <select
                value={song.chart.trackName}
                onChange={(event) => selectTrack(event.target.value)}
              >
                {song.charts.map((chart) => (
                  <option key={chart.trackName} value={chart.trackName}>
                    {chart.trackName
                      .replace(/^Easy/, 'Easy · ')
                      .replace(/^Medium/, 'Medium · ')
                      .replace(/^Hard/, 'Hard · ')
                      .replace(/^Expert/, 'Expert · ')
                      .replace('Single', 'Guitar')
                      .replace('DoubleGuitar', 'Co-op Guitar')
                      .replace('DoubleBass', 'Bass')
                      .replace('DoubleRhythm', 'Rhythm')}
                    {' · '}
                    {chart.notes.length} notes
                  </option>
                ))}
              </select>
            </label>
          )}

          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
          />

          {(error || libraryError) && (
            <p className={styles.error}>{error || libraryError}</p>
          )}

          <button
            type="button"
            className="button primary large"
            disabled={importing || !libraryReady}
            onClick={() => navigate('/play')}
          >
            {importing
              ? 'Reading folder…'
              : `Play ${song.chart.metadata.name}`}
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <aside className={styles.instructions}>
          <p className="eyebrow">Keyboard fallback</p>
          <h2>Hold, then strum</h2>
          <div className={styles.keys}>
            {['A', 'S', 'D', 'F', 'G'].map((key, index) => (
              <kbd key={key} data-lane={index}>{key}</kbd>
            ))}
          </div>
          <p>
            Hold the matching fret keys and press <kbd>Space</kbd>,{' '}
            <kbd>Enter</kbd>, or an arrow key to strum.
          </p>
        </aside>
      </section>

      <section className={styles.settingsGrid}>
        <section className={styles.timingPanel}>
          <div>
            <p className="eyebrow">Saved gameplay setup</p>
            <h2>Timing and highway</h2>
            <p>
              Input correction moves scored strums earlier; visual correction
              moves notes farther down the highway. Higher note speed creates
              more space between dense notes without changing the song.
            </p>
          </div>
          <label>
            <span>
              Input correction
              <strong>{calibration.inputOffsetMs} ms</strong>
            </span>
            <input
              type="range"
              min="-200"
              max="200"
              step="1"
              value={calibration.inputOffsetMs}
              onChange={(event) =>
                setCalibration({
                  ...calibration,
                  inputOffsetMs: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>
              Visual correction
              <strong>{calibration.videoOffsetMs} ms</strong>
            </span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              value={calibration.videoOffsetMs}
              onChange={(event) =>
                setCalibration({
                  ...calibration,
                  videoOffsetMs: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>
              Highway speed
              <strong>{highwaySettings.noteSpeed}</strong>
            </span>
            <input
              type="range"
              min="6"
              max="18"
              step="1"
              value={highwaySettings.noteSpeed}
              onChange={(event) =>
                setHighwaySettings({
                  noteSpeed: Number(event.target.value),
                })
              }
            />
          </label>
        </section>

        <ControllerSetup
          mapping={controllerMapping}
          onChange={setControllerMapping}
        />
      </section>

      <footer className={styles.footer}>
        <span>No account. No upload. No network timing.</span>
        <span>Your song library stays on this device.</span>
      </footer>
    </main>
  )
}
