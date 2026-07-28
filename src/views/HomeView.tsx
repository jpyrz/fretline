import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../components/AlbumArtwork'
import { useAppState } from '../state/AppState'
import styles from './HomeView.module.scss'

export function HomeView() {
  const navigate = useNavigate()
  const {
    song,
    songs,
    controllerMapping,
    libraryReady,
    useTimingLab: activateTimingLab,
  } = useAppState()
  const playableSongs = songs.filter((candidate) => candidate.kind === 'folder')

  const openTimingLab = () => {
    activateTimingLab()
    navigate('/play')
  }

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.topbar}>
        <a href="/" className={styles.miniBrand} aria-label="Fretline home">
          <span>F</span>
          Fretline
        </a>
        <p>
          Five-fret browser prototype
          <strong>v0.1</strong>
        </p>
      </header>

      <section className={styles.menuStage}>
        <nav className={styles.mainMenu} aria-label="Main menu">
          <p>Choose a mode</p>
          <button
            type="button"
            className={styles.primaryItem}
            onClick={() => navigate('/songs')}
          >
            <span>Quick Play</span>
            <small>
              {libraryReady
                ? `${playableSongs.length} songs ready`
                : 'Loading library…'}
            </small>
          </button>
          <button type="button" onClick={openTimingLab}>
            <span>Timing Lab</span>
            <small>Calibration run</small>
          </button>
          <button type="button" onClick={() => navigate('/settings')}>
            <span>Settings</span>
            <small>Controls · timing · highway</small>
          </button>
        </nav>

        <div className={styles.logoLockup} aria-label="Fretline">
          <p>Browser rhythm lab</p>
          <h1>
            <span>Fret</span>
            <span>Line</span>
          </h1>
          <div className={styles.fretDots} aria-hidden="true">
            {['green', 'red', 'yellow', 'blue', 'orange'].map((lane) => (
              <i key={lane} data-lane={lane} />
            ))}
          </div>
        </div>

        <aside className={styles.nowPlaying}>
          <p>Currently selected</p>
          <AlbumArtwork song={song} />
          <div>
            <strong>{song.chart.metadata.name}</strong>
            <span>{song.chart.metadata.artist}</span>
            <small>
              {song.kind === 'calibration'
                ? 'Timing Lab'
                : song.chart.trackName.replace('Single', ' Guitar')}
            </small>
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <div>
          <i data-connected={Boolean(controllerMapping)} />
          <span>
            {controllerMapping
              ? 'Guitar mapped and ready'
              : 'Keyboard ready · Map a guitar in Settings'}
          </span>
        </div>
        <p>
          <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd>
          <span>Hold frets</span>
          <kbd>Space</kbd>
          <span>Strum</span>
        </p>
      </footer>
    </main>
  )
}
