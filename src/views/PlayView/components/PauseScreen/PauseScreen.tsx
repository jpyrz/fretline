import { Link } from 'react-router-dom'
import type { LocalSong, SessionStats } from '../../../../types/game'
import styles from '../../PlayView.module.scss'

function formatTrackName(trackName: string): string {
  return trackName
    .replace(/^Easy/, 'Easy · ')
    .replace(/^Medium/, 'Medium · ')
    .replace(/^Hard/, 'Hard · ')
    .replace(/^Expert/, 'Expert · ')
    .replace('Single', 'Guitar')
    .replace('DoubleGuitar', 'Co-op Guitar')
    .replace('DoubleBass', 'Bass')
    .replace('DoubleRhythm', 'Rhythm')
}

interface PauseScreenProps {
  song: LocalSong
  stats: SessionStats
  onResume: () => void
  onRestart: () => void
  onLeave: () => void
}

export function PauseScreen({
  song,
  stats,
  onResume,
  onRestart,
  onLeave,
}: PauseScreenProps) {
  return (
    <div className={styles.pauseScreen} role="dialog" aria-modal="true">
      <section className={styles.pauseSongInfo}>
        <p>Now playing</p>
        <h2>{song.chart.metadata.name}</h2>
        <strong>{song.chart.metadata.artist}</strong>
        <dl>
          <div>
            <dt>Chart</dt>
            <dd>{formatTrackName(song.chart.trackName)}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{stats.score.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Notes hit</dt>
            <dd>
              {stats.hits}/{song.chart.notes.length}
            </dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{stats.bestStreak}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.pauseMenu}>
        <h1>Paused</h1>
        <div className={styles.pauseHints}>
          <span>
            <i data-color="green" /> Select
          </span>
          <span>
            <i data-color="red" /> Back
          </span>
          <span>Start Resume</span>
        </div>
        <nav aria-label="Pause menu">
          <button
            type="button"
            data-primary="true"
            data-controller-default
            data-controller-nav-item
            data-controller-back
            onClick={onResume}
          >
            Resume
          </button>
          <button
            type="button"
            data-controller-nav-item
            onClick={onRestart}
          >
            Restart song
          </button>
          <Link to="/songs" data-controller-nav-item onClick={onLeave}>
            Song selection
          </Link>
          <Link to="/settings" data-controller-nav-item onClick={onLeave}>
            Settings
          </Link>
          <Link to="/" data-controller-nav-item onClick={onLeave}>
            Main menu
          </Link>
        </nav>
        <small>
          Press <kbd>Start</kbd>, <kbd>Esc</kbd>, or <kbd>P</kbd> to resume
        </small>
      </section>
    </div>
  )
}
