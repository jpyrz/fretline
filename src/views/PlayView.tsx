import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HighwayCanvas } from '../components/HighwayCanvas'
import { GameEngine } from '../game/GameEngine'
import { drawHighway } from '../game/drawHighway'
import { createCalibrationAudio } from '../lib/calibrationSong'
import { median } from '../lib/scoring'
import { audioFileMetadata } from '../lib/songLibrary'
import {
  decodeSongAudio,
  takePreparedGameplayAudioContext,
} from '../lib/songAudio'
import { selectVisualAsset } from '../lib/visualAssets'
import { useAppState } from '../state/AppState'
import type { GameFrame, LocalSong, SessionStats } from '../types/game'
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
  starPowerMeter: 0,
  starPowerActive: false,
  starPowerPhrasesHit: 0,
  starPowerPhrasesMissed: 0,
  starPowerActivations: 0,
  lastErrorMs: null,
  records: [],
}

function whammyBufferIndices(song: LocalSong): number[] {
  const track = song.chart.trackName.toLowerCase()
  const preferredStems = track.includes('doublebass')
    ? ['bass', 'rhythm']
    : track.includes('doublerhythm')
      ? ['rhythm', 'bass']
      : ['guitar']

  for (const stem of preferredStems) {
    const index = audioFileMetadata(song).findIndex(
      (file) =>
        file.name.replace(/\.[^.]+$/, '').toLowerCase() === stem,
    )
    if (index >= 0) return [index]
  }
  return []
}

function useVisualImage(file: File | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!file) {
      setImage(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    const nextImage = new Image()
    let active = true
    setImage(null)
    nextImage.onload = () => {
      if (active) setImage(nextImage)
    }
    nextImage.onerror = () => {
      if (active) setImage(null)
    }
    nextImage.src = objectUrl
    return () => {
      active = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return image
}

export function PlayView() {
  const location = useLocation()
  const {
    song,
    calibration,
    setCalibration,
    highwaySettings,
    visualAssets,
    visualSettings,
    controllerMapping,
    keyboardMapping,
  } = useAppState()
  const autoStartRequested =
    song.kind === 'folder' && location.state?.autoStart === true
  const loadingPhrase =
    typeof location.state?.loadingPhrase === 'string'
      ? location.state.loadingPhrase
      : 'Warming up the amp'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const autoStartedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>(
    autoStartRequested ? 'loading' : 'ready',
  )
  const immersiveLoading = autoStartRequested && phase === 'loading'
  const [stats, setStats] = useState<SessionStats>(emptyStats)
  const [error, setError] = useState('')
  const [runInputOffsetMs, setRunInputOffsetMs] = useState(
    calibration.inputOffsetMs,
  )
  const [appliedOffsetMs, setAppliedOffsetMs] = useState<number | null>(null)
  const backgroundAsset = useMemo(
    () =>
      selectVisualAsset(
        visualAssets,
        'background',
        visualSettings.backgroundSelection,
        song.id,
      ),
    [
      song.id,
      visualAssets,
      visualSettings.backgroundSelection,
    ],
  )
  const highwayAsset = useMemo(
    () =>
      selectVisualAsset(
        visualAssets,
        'highway',
        visualSettings.highwaySelection,
        song.id,
      ),
    [song.id, visualAssets, visualSettings.highwaySelection],
  )
  const backgroundImage = useVisualImage(backgroundAsset?.file)
  const highwayImage = useVisualImage(highwayAsset?.file)
  const highwayVisuals = useMemo(
    () => ({
      backgroundImage,
      backgroundDim: visualSettings.backgroundDim,
      highwayImage,
      highwayOpacity: visualSettings.highwayOpacity,
      missFeedback: highwaySettings.missFeedback,
    }),
    [
      backgroundImage,
      highwayImage,
      highwaySettings.missFeedback,
      visualSettings.backgroundDim,
      visualSettings.highwayOpacity,
    ],
  )
  const highwayVisualsRef = useRef(highwayVisuals)
  highwayVisualsRef.current = highwayVisuals

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
  const chartProgress =
    song.chart.notes.length > 0
      ? Math.min(
          100,
          ((stats.hits + stats.misses) / song.chart.notes.length) * 100,
        )
      : 0
  const multiplier =
    Math.min(4, Math.floor(stats.streak / 10) + 1) *
    (stats.starPowerActive ? 2 : 1)
  const loadingFrame = useMemo<GameFrame>(
    () => ({
      songTimeSeconds: -10,
      visualTimeSeconds: -10,
      heldLanes: [],
      noteStates: song.chart.notes.map(() => 'pending'),
      sustainStates: song.chart.notes.map(() => 'none'),
      activeSustainIndices: [],
      stats: emptyStats,
      whammyAmount: 0,
      hitFlash: null,
      missFlash: null,
    }),
    [song.chart.notes],
  )

  const stopSession = () => {
    engineRef.current?.stop()
    engineRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }

  useEffect(() => stopSession, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!immersiveLoading || !canvas) return
    const drawLoadingHighway = () =>
      drawHighway(
        canvas,
        song.chart,
        loadingFrame,
        highwaySettings.noteSpeed,
        highwaySettings.length,
        highwayVisuals,
      )
    const frame = requestAnimationFrame(drawLoadingHighway)
    const observer = new ResizeObserver(drawLoadingHighway)
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [
    highwaySettings.noteSpeed,
    highwaySettings.length,
    highwayVisuals,
    immersiveLoading,
    loadingFrame,
    song.chart,
  ])

  const startSession = async () => {
    stopSession()
    setPhase('loading')
    setStats(emptyStats)
    setError('')
    setRunInputOffsetMs(calibration.inputOffsetMs)
    setAppliedOffsetMs(null)

    try {
      const audioContext =
        song.kind === 'folder'
          ? takePreparedGameplayAudioContext() ??
            new AudioContext({ latencyHint: 'interactive' })
          : new AudioContext({ latencyHint: 'interactive' })
      audioContextRef.current = audioContext
      await audioContext.resume()
      if (audioContext.state !== 'running') {
        throw new Error(
          'The browser paused the audio clock. Press start to try again.',
        )
      }
      const audioBuffersPromise =
        song.kind === 'calibration'
          ? Promise.resolve([createCalibrationAudio(audioContext)])
          : decodeSongAudio(song, audioContext)
      const minimumLoadingTime = autoStartRequested
        ? new Promise<void>((resolve) => window.setTimeout(resolve, 900))
        : Promise.resolve()
      const [audioBuffers] = await Promise.all([
        audioBuffersPromise,
        minimumLoadingTime,
      ])

      const engine = new GameEngine({
        audioContext,
        audioBuffers,
        chart: song.chart,
        calibration,
        controllerMapping,
        keyboardMapping,
        whammyBufferIndices: whammyBufferIndices(song),
        onFrame: (frame) => {
          if (canvasRef.current) {
            drawHighway(
              canvasRef.current,
              song.chart,
              frame,
              highwaySettings.noteSpeed,
              highwaySettings.length,
              highwayVisualsRef.current,
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
  const startSessionEvent = useEffectEvent(startSession)

  useEffect(() => {
    if (!autoStartRequested || autoStartedRef.current) return
    const frame = requestAnimationFrame(() => {
      if (autoStartedRef.current) return
      autoStartedRef.current = true
      void startSessionEvent()
    })
    return () => cancelAnimationFrame(frame)
  }, [autoStartRequested])

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

  const handleControllerAction = useEffectEvent((event: Event) => {
    if (
      !(event instanceof CustomEvent) ||
      event.detail?.action !== 'start'
    ) {
      return
    }

    if (phase === 'playing' || phase === 'paused') {
      togglePause()
    } else if (
      phase === 'ready' ||
      phase === 'error' ||
      phase === 'finished'
    ) {
      void startSession()
    }
  })

  useEffect(() => {
    window.addEventListener(
      'fretline:controller-action',
      handleControllerAction,
    )
    return () =>
      window.removeEventListener(
        'fretline:controller-action',
        handleControllerAction,
      )
  }, [])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden && phase === 'playing') {
        engineRef.current?.pause()
      }
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () =>
      document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [phase])

  return (
    <main
      className={styles.page}
      data-session={
        phase === 'playing' || phase === 'paused' || immersiveLoading
      }
      data-controller-gameplay={phase === 'playing'}
    >
      <header
        className={styles.header}
        data-hidden={
          phase === 'playing' || phase === 'paused' || immersiveLoading
        }
      >
        <Link
          to={song.kind === 'folder' ? '/songs' : '/'}
          data-controller-back
          onClick={stopSession}
        >
          <span aria-hidden="true">←</span>
          {song.kind === 'folder' ? 'Song selection' : 'Main menu'}
        </Link>
        <div className={styles.songTitle}>
          <span>{song.chart.metadata.artist}</span>
          <strong>{song.chart.metadata.name}</strong>
        </div>
        <div className={styles.headerActions}>
          {(phase === 'playing' || phase === 'paused') && (
            <button
              type="button"
              className={styles.sessionButton}
              onClick={togglePause}
            >
              {phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
          )}
          <span className={styles.clock} data-paused={phase === 'paused'}>
            {phase === 'paused' ? 'Paused' : 'Audio clock'} <i />
          </span>
        </div>
      </header>

      <section className={styles.gameLayout}>
        <div className={styles.highwayWrap}>
          <HighwayCanvas ref={canvasRef} />

          {immersiveLoading && (
            <div
              className={styles.loadingOverlay}
              role="status"
              aria-live="polite"
            >
              <h1>
                {loadingPhrase}
                <span className={styles.loadingDots} aria-hidden="true" />
              </h1>
            </div>
          )}

          {(phase === 'ready' ||
            (phase === 'loading' && !autoStartRequested) ||
            phase === 'error') && (
            <div className={styles.overlay}>
              <p className="eyebrow">Timing run</p>
              <h1>
                {phase === 'loading'
                  ? autoStartRequested
                    ? 'Taking the stage…'
                    : 'Decoding audio…'
                  : phase === 'error'
                    ? 'Could not start'
                    : 'Ready when you are'}
              </h1>
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : (
                <>
                  <p>
                    Read the gem center: dark caps require a strum, white caps
                    are HOPOs, and translucent glowing gems are taps.
                  </p>
                  <div className={styles.noteLegend} aria-label="Note types">
                    <span data-note-type="strum"><i /> Strum</span>
                    <span data-note-type="hopo"><i /> HOPO</span>
                    <span data-note-type="tap"><i /> Tap</span>
                  </div>
                </>
              )}
              <button
                type="button"
                className="button primary large"
                data-controller-default
                data-controller-nav-item
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
                <div>
                  <span>Star phrases</span>
                  <strong>{stats.starPowerPhrasesHit}</strong>
                </div>
                <div>
                  <span>Activations</span>
                  <strong>{stats.starPowerActivations}</strong>
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
                    data-controller-nav-item
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
                  data-controller-default
                  data-controller-nav-item
                  onClick={() => void startSession()}
                >
                  Run again
                </button>
              </div>
            </div>
          )}

        </div>

        {!immersiveLoading && (
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
            <div aria-label={`Star power ${Math.round(stats.starPowerMeter * 100)} percent`}>
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
          {(phase === 'playing' || phase === 'paused') && (
            <button
              type="button"
              aria-label={phase === 'paused' ? 'Resume song' : 'Pause song'}
              onClick={togglePause}
            >
              {phase === 'paused' ? '▶' : 'Ⅱ'}
            </button>
          )}
        </section>
        )}
      </section>

      {phase === 'paused' && (
        <div className={styles.pauseScreen} role="dialog" aria-modal="true">
          <section className={styles.pauseSongInfo}>
            <p>Now playing</p>
            <h2>{song.chart.metadata.name}</h2>
            <strong>{song.chart.metadata.artist}</strong>
            <dl>
              <div>
                <dt>Chart</dt>
                <dd>
                  {song.chart.trackName
                    .replace(/^Easy/, 'Easy · ')
                    .replace(/^Medium/, 'Medium · ')
                    .replace(/^Hard/, 'Hard · ')
                    .replace(/^Expert/, 'Expert · ')
                    .replace('Single', 'Guitar')
                    .replace('DoubleGuitar', 'Co-op Guitar')
                    .replace('DoubleBass', 'Bass')
                    .replace('DoubleRhythm', 'Rhythm')}
                </dd>
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
              <span><i data-color="green" /> Select</span>
              <span><i data-color="red" /> Back</span>
              <span>Start Resume</span>
            </div>
            <nav aria-label="Pause menu">
              <button
                type="button"
                data-primary="true"
                data-controller-default
                data-controller-nav-item
                data-controller-back
                onClick={togglePause}
              >
                Resume
              </button>
              <button
                type="button"
                data-controller-nav-item
                onClick={restartSession}
              >
                Restart song
              </button>
              <Link
                to="/songs"
                data-controller-nav-item
                onClick={stopSession}
              >
                Song selection
              </Link>
              <Link
                to="/settings"
                data-controller-nav-item
                onClick={stopSession}
              >
                Settings
              </Link>
              <Link
                to="/"
                data-controller-nav-item
                onClick={stopSession}
              >
                Main menu
              </Link>
            </nav>
            <small>
              Press <kbd>Start</kbd>, <kbd>Esc</kbd>, or <kbd>P</kbd> to resume
            </small>
          </section>
        </div>
      )}
    </main>
  )
}
