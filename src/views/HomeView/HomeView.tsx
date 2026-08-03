import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumArtwork } from '../../components/AlbumArtwork'
import { useControllerConnection } from '../../hooks/useControllerConnection'
import { useAppState } from '../../state/AppState'
import { useHomeAudio } from './hooks/useHomeAudio'
import styles from './HomeView.module.scss'

const newsItems = [
  {
    date: '28 JUL, 2026',
    title: 'HOPO, tap, and forced-note rules rebuilt',
  },
  {
    date: '27 JUL, 2026',
    title: 'Google Drive libraries now scan nested folders',
  },
  {
    date: '26 JUL, 2026',
    title: 'Full-screen highway and guitar mapping added',
  },
]

function playbackLabel(status: ReturnType<typeof useHomeAudio>['status']) {
  if (status === 'loading') return 'Preparing audio…'
  if (status === 'waiting') return 'Press any button for music'
  if (status === 'playing') return 'Now playing'
  if (status === 'error') return 'Preview unavailable'
  return 'Add songs to start the jukebox'
}

export function HomeView() {
  const navigate = useNavigate()
  const {
    songs,
    controllerMapping,
    libraryReady,
    audioSettings,
  } = useAppState()
  const playableSongs = useMemo(
    () => songs.filter((candidate) => candidate.kind === 'folder'),
    [songs],
  )
  const controllerConnected = useControllerConnection(controllerMapping)
  const homeAudio = useHomeAudio(
    playableSongs,
    audioSettings.homeMusicMuted,
  )
  const songCountLabel = `${playableSongs.length} ${
    playableSongs.length === 1 ? 'song' : 'songs'
  } ready`

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.topbar}>
        <a href="/" className={styles.miniBrand} aria-label="Fretline home">
          <span>F</span>
          Fretline
        </a>
        <p>
          Browser rhythm game
          <strong>Prototype v0.1</strong>
        </p>
      </header>

      <section className={styles.menuStage}>
        <nav className={styles.mainMenu} aria-label="Main menu">
          <p>Main menu</p>
          <button
            type="button"
            data-controller-default
            data-controller-nav-item
            onClick={() => navigate('/songs')}
          >
            <span>Quick Play</span>
            <small>
              {libraryReady
                ? songCountLabel
                : 'Loading library…'}
            </small>
          </button>
          <button
            type="button"
            data-controller-nav-item
            className={styles.comingSoon}
            disabled
          >
            <span>Tour Mode</span>
            <small>
              <i aria-hidden="true">★</i>
              Coming soon
            </small>
          </button>
          <button
            type="button"
            data-controller-nav-item
            onClick={() => navigate('/settings')}
          >
            <span>Settings</span>
            <small>Library · timing · controls · visuals</small>
          </button>
        </nav>

        <div className={styles.logoLockup} aria-label="Fretline">
          <p>Turn it up</p>
          <h1>
            <span>Fret</span>
            <span>Line</span>
          </h1>
          <strong>Browser rhythm. No compromises.</strong>
        </div>

        <aside className={styles.nowPlaying} aria-live="polite">
          <div className={styles.nowPlayingHeader}>
            <p>{playbackLabel(homeAudio.status)}</p>
            {homeAudio.currentSong &&
              (homeAudio.status === 'waiting' ||
                homeAudio.status === 'playing') && (
              <button
                type="button"
                onClick={
                  homeAudio.status === 'waiting'
                    ? homeAudio.start
                    : homeAudio.toggleMuted
                }
                aria-label={
                  homeAudio.status === 'waiting'
                    ? 'Start music'
                    : homeAudio.muted
                      ? 'Unmute music'
                      : 'Mute music'
                }
              >
                {homeAudio.status === 'waiting'
                  ? 'Start music'
                  : homeAudio.muted
                    ? 'Muted'
                    : 'Sound on'}
              </button>
              )}
          </div>
          {homeAudio.currentSong ? (
            <div className={styles.nowPlayingSong}>
              <AlbumArtwork song={homeAudio.currentSong} compact />
              <div>
                <strong>
                  {homeAudio.currentSong.chart.metadata.name}
                </strong>
                <span>{homeAudio.currentSong.chart.metadata.artist}</span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyNowPlaying}>
              <span>♪</span>
              <p>Your library soundtrack will appear here.</p>
            </div>
          )}
          <div className={styles.playbackProgress} aria-hidden="true">
            <i style={{ width: `${homeAudio.progress * 100}%` }} />
          </div>
        </aside>

        <section className={styles.news} aria-labelledby="news-heading">
          <h2 id="news-heading">News</h2>
          <div>
            {newsItems.map((item) => (
              <article key={`${item.date}-${item.title}`}>
                <time>{item.date}</time>
                <p>{item.title}</p>
                <span aria-hidden="true">!</span>
              </article>
            ))}
          </div>
        </section>
      </section>

      <footer className={styles.footer}>
        <div>
          <i data-connected={controllerConnected} />
          <span>
            {controllerConnected
              ? 'Guitar connected'
              : controllerMapping
                ? 'Guitar mapped · Waiting to reconnect'
                : 'Keyboard ready · Map a guitar in Settings'}
          </span>
        </div>
        <p>
          {controllerMapping ? (
            <>
              <kbd>Strum</kbd><span>Navigate</span>
              <kbd data-fret="green">Green</kbd><span>Select</span>
              <kbd data-fret="red">Red</kbd><span>Back</span>
              <kbd>Start</kbd><span>Pause</span>
            </>
          ) : (
            <>
              <kbd>↑↓</kbd><span>Navigate</span>
              <kbd>Enter</kbd><span>Select</span>
              <kbd>Esc</kbd><span>Back</span>
            </>
          )}
        </p>
      </footer>
    </main>
  )
}
