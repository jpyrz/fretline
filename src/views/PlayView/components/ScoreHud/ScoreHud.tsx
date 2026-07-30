import type { SessionStats } from '../../../../types/game'
import styles from '../../PlayView.module.scss'

interface ScoreHudProps {
  stats: SessionStats
  chartProgress: number
  multiplier: number
  paused: boolean
  sessionActive: boolean
  onTogglePause: () => void
}

export function ScoreHud({
  stats,
  chartProgress,
  multiplier,
  paused,
  sessionActive,
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
      <div
        className={styles.starPower}
        data-active={stats.starPowerActive || undefined}
        data-ready={
          !stats.starPowerActive && stats.starPowerMeter >= 0.5
            ? 'true'
            : undefined
        }
      >
        <span aria-hidden="true">★</span>
        <div
          aria-label={`Star power ${Math.round(stats.starPowerMeter * 100)} percent`}
        >
          <i
            style={{
              height: `${Math.round(stats.starPowerMeter * 100)}%`,
            }}
          />
        </div>
        <small>
          {stats.starPowerActive
            ? 'Star power'
            : stats.starPowerMeter >= 0.5
              ? 'Ready'
              : 'Build power'}
        </small>
      </div>
      <div className={styles.scoreDetails}>
        <span>
          Streak <strong>{stats.streak}</strong>
        </span>
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
