import type { SessionStats } from '../../../../types/game'
import {
  formatPracticeSpeed,
  type PracticeSpeed,
} from '../../../../lib/practiceMode'
import styles from '../../PlayView.module.scss'

interface ScoreHudProps {
  stats: SessionStats
  chartProgress: number
  multiplier: number
  paused: boolean
  sessionActive: boolean
  practiceSpeed: PracticeSpeed
  onTogglePause: () => void
}

export function ScoreHud({
  stats,
  chartProgress,
  multiplier,
  paused,
  sessionActive,
  practiceSpeed,
  onTogglePause,
}: ScoreHudProps) {
  return (
    <section className={styles.scoreHud} aria-label="Current score">
      <div className={styles.scoreValue}>
        <span>Score</span>
        <strong>{stats.score.toLocaleString().padStart(6, '0')}</strong>
      </div>
      <div className={styles.scoreProgress} aria-hidden="true">
        <i style={{ width: `${chartProgress}%` }} />
      </div>
      <div className={styles.scoreDetails}>
        <span>
          Streak <strong>{stats.streak}</strong>
        </span>
        {practiceSpeed < 1 && (
          <span className={styles.practiceBadge}>
            Practice {formatPracticeSpeed(practiceSpeed)}
          </span>
        )}
        <b>×{multiplier}</b>
      </div>
      {sessionActive && (
        <button
          type="button"
          aria-label={paused ? 'Resume song' : 'Pause song'}
          onClick={onTogglePause}
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
      )}
    </section>
  )
}
