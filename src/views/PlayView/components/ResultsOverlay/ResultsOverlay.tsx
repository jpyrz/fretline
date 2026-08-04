import type { PlayInputMode } from '../../../../lib/inputMode'
import type {
  CalibrationSettings,
  SessionStats,
} from '../../../../types/game'
import type { RunSaveState, SessionResults } from '../../sessionResults'
import styles from '../../PlayView.module.scss'

interface ResultsOverlayProps {
  stats: SessionStats
  noteCount: number
  calibrationRun: boolean
  inputMode: PlayInputMode
  results: SessionResults
  appliedCalibration: CalibrationSettings | null
  onApplySuggestion: () => void
  onRunAgain: () => void
  playerName: string | null
  saveState: RunSaveState
  newPersonalBest: boolean
}

export function ResultsOverlay({
  stats,
  noteCount,
  calibrationRun,
  inputMode,
  results,
  appliedCalibration,
  onApplySuggestion,
  onRunAgain,
  playerName,
  saveState,
  newPersonalBest,
}: ResultsOverlayProps) {
  return (
    <div className={`${styles.overlay} ${styles.resultsOverlay}`}>
      <p className="eyebrow">Run complete</p>
      {inputMode === 'tap' && (
        <span className={styles.inputModeBadge}>Tap Mode · HandiTap</span>
      )}
      <h1>
        <span className={styles.resultRank}>{results.resultRank}</span>
        {results.noteAccuracy.toFixed(1)}%
      </h1>
      {results.fullCombo && (
        <strong className={styles.fullCombo}>Full combo</strong>
      )}
      {!calibrationRun && (
        <div className={styles.profileSaveState} data-state={saveState}>
          <span>{playerName ?? 'Player'}</span>
          <strong>
            {saveState === 'saving'
              ? 'Saving run…'
              : saveState === 'saved'
                ? newPersonalBest
                  ? 'New personal best'
                  : 'Run saved'
                : saveState === 'guest'
                  ? 'Guest run · not saved'
                  : saveState === 'practice'
                    ? 'Practice run · records unchanged'
                    : saveState === 'error'
                      ? 'Run could not be saved'
                      : 'Finishing run…'}
          </strong>
        </div>
      )}
      <div className={styles.resultsGrid}>
        <div>
          <span>Score</span>
          <strong>{stats.score.toLocaleString()}</strong>
        </div>
        <div>
          <span>Notes hit</span>
          <strong>
            {stats.hits}/{noteCount}
          </strong>
        </div>
        <div>
          <span>Best streak</span>
          <strong>{stats.bestStreak}</strong>
        </div>
        <div>
          <span>Overstrums</span>
          <strong>{stats.overstrums}</strong>
        </div>
        <div>
          <span>Median timing</span>
          <strong>
            {results.timingMedian === null
              ? '—'
              : `${results.timingMedian >= 0 ? '+' : ''}${results.timingMedian.toFixed(1)} ms`}
          </strong>
        </div>
        <div>
          <span>Mean error</span>
          <strong>
            {results.meanAbsoluteError === null
              ? '—'
              : `${results.meanAbsoluteError.toFixed(1)} ms`}
          </strong>
        </div>
        <div>
          <span>Sustain points</span>
          <strong>{stats.sustainPoints.toLocaleString()}</strong>
        </div>
        <div>
          <span>Broken holds</span>
          <strong>{stats.sustainsBroken}</strong>
        </div>
        <div>
          <span>Star phrases</span>
          <strong>{stats.starPowerPhrasesHit}</strong>
        </div>
        <div>
          <span>Activations</span>
          <strong>{stats.starPowerActivations}</strong>
        </div>
      </div>
      {!calibrationRun ? (
        <p>
          {results.earlyHits} early · {results.lateHits} late ·{' '}
          {stats.sustainsCompleted} holds completed
        </p>
      ) : appliedCalibration !== null ? (
        <div className={styles.appliedNotice} role="status">
          <strong>Full calibration saved</strong>
          <span>
            {appliedCalibration.audioOffsetMs} ms audio ·{' '}
            {appliedCalibration.inputOffsetMs} ms input
          </span>
          <small>The active timing setup is ready for real songs.</small>
        </div>
      ) : (
        <p>
          {results.suggestedCorrection === null
            ? 'Hit more notes to calculate a timing recommendation.'
            : `Median timing was ${results.suggestedCorrection >= 0 ? '+' : ''}${results.suggestedCorrection.toFixed(1)} ms.`}
        </p>
      )}
      <div className={styles.overlayActions}>
        {calibrationRun && results.suggestedCorrection !== null && (
          <button
            type="button"
            className="button primary"
            data-controller-nav-item
            disabled={appliedCalibration !== null}
            onClick={onApplySuggestion}
          >
            {appliedCalibration !== null
              ? 'Calibration saved ✓'
              : 'Apply full calibration'}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          data-controller-default
          data-controller-nav-item
          onClick={onRunAgain}
        >
          Run again
        </button>
      </div>
    </div>
  )
}
