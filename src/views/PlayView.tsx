import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HighwayCanvas } from '../components/HighwayCanvas'
import { TimingHistogram } from '../components/TimingHistogram'
import { GameEngine } from '../game/GameEngine'
import { drawHighway } from '../game/drawHighway'
import { createCalibrationAudio } from '../lib/calibrationSong'
import { median } from '../lib/scoring'
import { decodeAudioFiles } from '../lib/songImport'
import { useAppState } from '../state/AppState'
import type { SessionStats } from '../types/game'
import styles from './PlayView.module.scss'

type Phase =
  | 'ready'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error'

const emptyStats: SessionStats = {
  score: 0,
  sustainPoints: 0,
  streak: 0,
  bestStreak: 0,
  hits: 0,
  misses: 0,
  overstrums: 0,
  sustainsCompleted: 0,
  sustainsBroken: 0,
  lastErrorMs: null,
  records: [],
}

export function PlayView() {
  const {
    song,
    calibration,
    setCalibration,
    highwaySettings,
    controllerMapping,
  } = useAppState()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [stats, setStats] = useState<SessionStats>(emptyStats)
  const [error, setError] = useState('')
  const [runInputOffsetMs, setRunInputOffsetMs] = useState(
    calibration.inputOffsetMs,
  )
  const [appliedOffsetMs, setAppliedOffsetMs] = useState<number | null>(null)

  const hitErrors = useMemo(
    () =>
      stats.records
        .filter((record) => record.result === 'hit')
        .slice(song.kind === 'calibration' ? 4 : 0)
        .map((record) => record.errorMs),
    [song.kind, stats.records],
  )
  const suggestedCorrection = median(hitErrors)
  const allHitErrors = stats.records
    .filter((record) => record.result === 'hit')
    .map((record) => record.errorMs)
  const timingMedian = median(allHitErrors)
  const meanAbsoluteError =
    allHitErrors.length > 0
      ? allHitErrors.reduce((total, errorMs) => total + Math.abs(errorMs), 0) /
        allHitErrors.length
      : null
  const earlyHits = allHitErrors.filter((errorMs) => errorMs < -8).length
  const lateHits = allHitErrors.filter((errorMs) => errorMs > 8).length
  const noteAccuracy =
    song.chart.notes.length > 0
      ? (stats.hits / song.chart.notes.length) * 100
      : 0
  const resultRank =
    noteAccuracy >= 99
      ? 'S'
      : noteAccuracy >= 95
        ? 'A'
        : noteAccuracy >= 88
          ? 'B'
          : noteAccuracy >= 75
            ? 'C'
            : 'D'
  const fullCombo =
    stats.hits === song.chart.notes.length &&
    stats.misses === 0 &&
    stats.overstrums === 0 &&
    stats.sustainsBroken === 0

  const stopSession = () => {
    engineRef.current?.stop()
    engineRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }

  useEffect(() => stopSession, [])

  const startSession = async () => {
    stopSession()
    setPhase('loading')
    setStats(emptyStats)
    setError('')
    setRunInputOffsetMs(calibration.inputOffsetMs)
    setAppliedOffsetMs(null)

    try {
      const audioContext = new AudioContext({ latencyHint: 'interactive' })
      audioContextRef.current = audioContext
      await audioContext.resume()
      const audioBuffers =
        song.kind === 'calibration'
          ? [createCalibrationAudio(audioContext)]
          : await decodeAudioFiles(audioContext, song.audioFiles)

      const engine = new GameEngine({
        audioContext,
        audioBuffers,
        chart: song.chart,
        calibration,
        controllerMapping,
        onFrame: (frame) => {
          if (canvasRef.current) {
            drawHighway(
              canvasRef.current,
              song.chart,
              frame,
              highwaySettings.noteSpeed,
            )
          }
        },
        onStats: setStats,
        onFinish: (finalStats) => {
          setStats(finalStats)
          setPhase('finished')
          engineRef.current = null
          void audioContextRef.current?.close()
          audioContextRef.current = null
        },
        onPauseChange: (paused) => {
          setPhase(paused ? 'paused' : 'playing')
        },
      })

      engineRef.current = engine
      setPhase('playing')
      engine.start()
    } catch (reason) {
      stopSession()
      setError(
        reason instanceof Error ? reason.message : 'The timing run could not start.',
      )
      setPhase('error')
    }
  }

  const applySuggestion = () => {
    if (suggestedCorrection === null || appliedOffsetMs !== null) return
    const nextOffsetMs = Math.round(
      runInputOffsetMs + suggestedCorrection,
    )
    setCalibration({
      ...calibration,
      inputOffsetMs: nextOffsetMs,
    })
    setAppliedOffsetMs(nextOffsetMs)
  }

  const togglePause = () => {
    engineRef.current?.togglePause()
  }

  const restartSession = () => {
    setStats(emptyStats)
    setAppliedOffsetMs(null)
    engineRef.current?.restart()
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/" onClick={stopSession}>← Setup</Link>
        <div className={styles.songTitle}>
          <span>{song.chart.metadata.artist}</span>
          <strong>{song.chart.metadata.name}</strong>
        </div>
        <div className={styles.headerActions}>
          {(phase === 'playing' || phase === 'paused') && (
            <>
              <button
                type="button"
                className={styles.sessionButton}
                onClick={restartSession}
              >
                Restart
              </button>
              <button
                type="button"
                className={styles.sessionButton}
                onClick={togglePause}
              >
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
            </>
          )}
          <span className={styles.clock} data-paused={phase === 'paused'}>
            {phase === 'paused' ? 'Paused' : 'Audio clock'} <i />
          </span>
        </div>
      </header>

      <section className={styles.gameLayout}>
        <div className={styles.highwayWrap}>
          <HighwayCanvas ref={canvasRef} />

          {(phase === 'ready' || phase === 'loading' || phase === 'error') && (
            <div className={styles.overlay}>
              <p className="eyebrow">Timing run</p>
              <h1>
                {phase === 'loading'
                  ? 'Decoding audio…'
                  : phase === 'error'
                    ? 'Could not start'
                    : 'Ready when you are'}
              </h1>
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : (
                <p>
                  Notes spread apart as they approach the strike line. Lower
                  notes arrive sooner; connected frets are played together.
                  Standard notes require a strum; center-marked HOPOs can
                  continue a streak with fret changes, and bright
                  center-marked taps need no strum.
                </p>
              )}
              <button
                type="button"
                className="button primary large"
                disabled={phase === 'loading'}
                onClick={() => void startSession()}
              >
                {phase === 'error' ? 'Try again' : 'Begin run'}
              </button>
            </div>
          )}

          {phase === 'finished' && (
            <div className={`${styles.overlay} ${styles.resultsOverlay}`}>
              <p className="eyebrow">Run complete</p>
              <h1>
                <span className={styles.resultRank}>{resultRank}</span>
                {noteAccuracy.toFixed(1)}%
              </h1>
              {fullCombo && (
                <strong className={styles.fullCombo}>Full combo</strong>
              )}
              <div className={styles.resultsGrid}>
                <div>
                  <span>Score</span>
                  <strong>{stats.score.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Notes hit</span>
                  <strong>
                    {stats.hits}/{song.chart.notes.length}
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
                    {timingMedian === null
                      ? '—'
                      : `${timingMedian >= 0 ? '+' : ''}${timingMedian.toFixed(1)} ms`}
                  </strong>
                </div>
                <div>
                  <span>Mean error</span>
                  <strong>
                    {meanAbsoluteError === null
                      ? '—'
                      : `${meanAbsoluteError.toFixed(1)} ms`}
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
              </div>
              {song.kind !== 'calibration' ? (
                <p>
                  {earlyHits} early · {lateHits} late ·{' '}
                  {stats.sustainsCompleted} holds completed
                </p>
              ) : appliedOffsetMs !== null ? (
                <div className={styles.appliedNotice} role="status">
                  <strong>Correction saved</strong>
                  <span>
                    {runInputOffsetMs} ms → {appliedOffsetMs} ms
                  </span>
                  <small>It will be used on the next run.</small>
                </div>
              ) : (
                <p>
                  {suggestedCorrection === null
                    ? 'Hit more notes to calculate a timing recommendation.'
                    : `Median timing was ${suggestedCorrection >= 0 ? '+' : ''}${suggestedCorrection.toFixed(1)} ms.`}
                </p>
              )}
              <div className={styles.overlayActions}>
                {song.kind === 'calibration' &&
                  suggestedCorrection !== null && (
                  <button
                    type="button"
                    className="button primary"
                    disabled={appliedOffsetMs !== null}
                    onClick={applySuggestion}
                  >
                    {appliedOffsetMs !== null
                      ? 'Correction saved ✓'
                      : 'Apply suggested correction'}
                  </button>
                  )}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void startSession()}
                >
                  Run again
                </button>
              </div>
            </div>
          )}

          {phase === 'paused' && (
            <div className={styles.overlay}>
              <p className="eyebrow">Session paused</p>
              <h1>Take a breath</h1>
              <p>
                Your exact song position is saved. Resume with P, Escape, or
                the button below.
              </p>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className="button primary"
                  onClick={togglePause}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={restartSession}
                >
                  Restart song
                </button>
                <Link
                  to="/"
                  className="button ghost"
                  onClick={stopSession}
                >
                  Quit to setup
                </Link>
              </div>
            </div>
          )}
        </div>

        <aside className={styles.telemetry}>
          <section className={styles.scoreCard}>
            <p>Score</p>
            <strong>{stats.score.toLocaleString()}</strong>
            <div>
              <span>
                Streak <b>{stats.streak}</b>
              </span>
              <span>
                Best <b>{stats.bestStreak}</b>
              </span>
            </div>
          </section>

          <section className={styles.accuracyCard}>
            <div className={styles.cardHeading}>
              <div>
                <p className="eyebrow">Latest strum</p>
                <h2>
                  {stats.lastErrorMs === null
                    ? '—'
                    : `${stats.lastErrorMs >= 0 ? '+' : ''}${stats.lastErrorMs.toFixed(1)} ms`}
                </h2>
              </div>
              <span
                data-status={
                  stats.lastErrorMs === null
                    ? 'idle'
                    : Math.abs(stats.lastErrorMs) < 35
                      ? 'good'
                      : 'warn'
                }
              >
                {stats.lastErrorMs === null
                  ? 'Waiting'
                  : stats.lastErrorMs < -8
                    ? 'Early'
                    : stats.lastErrorMs > 8
                      ? 'Late'
                      : 'Perfect'}
              </span>
            </div>
            <TimingHistogram records={stats.records} />
          </section>

          <section className={styles.sessionCard}>
            <p className="eyebrow">Session</p>
            <dl>
              <div>
                <dt>Hits</dt>
                <dd>{stats.hits}</dd>
              </div>
              <div>
                <dt>Misses</dt>
                <dd>{stats.misses}</dd>
              </div>
              <div>
                <dt>Overstrums</dt>
                <dd>{stats.overstrums}</dd>
              </div>
              <div>
                <dt>Sustain points</dt>
                <dd>{stats.sustainPoints.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Holds completed</dt>
                <dd>{stats.sustainsCompleted}</dd>
              </div>
              <div>
                <dt>Broken holds</dt>
                <dd>{stats.sustainsBroken}</dd>
              </div>
              <div>
                <dt>Input correction</dt>
                <dd>{calibration.inputOffsetMs} ms</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </main>
  )
}
