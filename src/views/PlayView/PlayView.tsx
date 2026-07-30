import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HighwayCanvas } from '../../components/HighwayCanvas'
import { GameEngine } from '../../game/GameEngine'
import { drawHighway } from '../../game/drawHighway'
import { createCalibrationAudio } from '../../lib/calibrationSong'
import { audioFileMetadata } from '../../lib/songLibrary'
import {
  decodeSongAudio,
  takePreparedGameplayAudioContext,
} from '../../lib/songAudio'
import { selectVisualAsset } from '../../lib/visualAssets'
import { useAppState } from '../../state/AppState'
import type { GameFrame, LocalSong, SessionStats } from '../../types/game'
import { PauseScreen } from './components/PauseScreen'
import { ResultsOverlay } from './components/ResultsOverlay'
import { ScoreHud } from './components/ScoreHud'
import { useVisualImage } from './hooks/useVisualImage'
import { calculateSessionResults } from './sessionResults'
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

  const {
    suggestedCorrection,
    timingMedian,
    meanAbsoluteError,
    earlyHits,
    lateHits,
    noteAccuracy,
    resultRank,
    fullCombo,
    chartProgress,
    multiplier,
  } = useMemo(
    () =>
      calculateSessionResults(
        stats,
        song.chart.notes.length,
        song.kind === 'calibration' ? 4 : 0,
      ),
    [song.chart.notes.length, song.kind, stats],
  )
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
            <ResultsOverlay
              stats={stats}
              noteCount={song.chart.notes.length}
              calibrationRun={song.kind === 'calibration'}
              results={{
                suggestedCorrection,
                timingMedian,
                meanAbsoluteError,
                earlyHits,
                lateHits,
                noteAccuracy,
                resultRank,
                fullCombo,
                chartProgress,
                multiplier,
              }}
              runInputOffsetMs={runInputOffsetMs}
              appliedOffsetMs={appliedOffsetMs}
              onApplySuggestion={applySuggestion}
              onRunAgain={() => void startSession()}
            />
          )}

        </div>

        {!immersiveLoading && (
          <ScoreHud
            stats={stats}
            chartProgress={chartProgress}
            multiplier={multiplier}
            paused={phase === 'paused'}
            sessionActive={phase === 'playing' || phase === 'paused'}
            onTogglePause={togglePause}
          />
        )}
      </section>

      {phase === 'paused' && (
        <PauseScreen
          song={song}
          stats={stats}
          onResume={togglePause}
          onRestart={restartSession}
          onLeave={stopSession}
        />
      )}
    </main>
  )
}
