import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BackIconButton } from '../../components/BackIconButton/BackIconButton'
import { HighwayCanvas } from '../../components/HighwayCanvas'
import { GameEngine } from '../../game/GameEngine'
import { drawHighway } from '../../game/drawHighway'
import {
  adaptChartForHandiTap,
  HANDITAP_VERSION,
} from '../../game/handiTap/handiTap'
import { preloadGameplayVfx } from '../../game/rendering/vfxSprites'
import { DEFAULT_HIT_LINE_RATIO } from '../../game/rendering/highwayGeometry'
import { useProfiles } from '../../features/profiles/ProfileProvider'
import { profileChartKey } from '../../features/profiles/runIdentity'
import { timingLabCalibration } from '../../features/timingPresets/timingLabCalibration'
import { createCalibrationAudio } from '../../lib/calibrationSong'
import { audioFileMetadata } from '../../lib/songLibrary'
import {
  decodeSongAudio,
  takePreparedGameplayAudioContext,
} from '../../lib/songAudio'
import { selectVisualAsset } from '../../lib/visualAssets'
import {
  normalizePracticeSpeed,
  type PracticeSpeed,
} from '../../lib/practiceMode'
import { parseTrackChoice } from '../../lib/trackSelection'
import { useAppState } from '../../state/AppState'
import type { GameFrame, LocalSong, SessionStats } from '../../types/game'
import { PauseScreen } from './components/PauseScreen'
import { ResultsOverlay } from './components/ResultsOverlay'
import { ScoreHud } from './components/ScoreHud'
import { TouchControls } from './components/TouchControls'
import { StarPowerRail } from './components/TouchControls/StarPowerRail'
import { useVisualImage } from './hooks/useVisualImage'
import { useGameplayInteractionLock } from './hooks/useGameplayInteractionLock'
import {
  calculateSessionResults,
  type RunSaveState,
} from './sessionResults'
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
  const navigate = useNavigate()
  const { session, activePlayerName, recordRun } = useProfiles()
  const {
    song,
    setSong,
    calibration,
    setCalibration,
    highwaySettings,
    visualAssets,
    visualSettings,
    controllerMapping,
    keyboardMapping,
    playPreferences,
    setPlayPreferences,
    observeOutputLatency,
    saveActiveTimingPresetLatency,
  } = useAppState()
  const requestedInputMode = location.state?.inputMode
  const inputMode =
    requestedInputMode === 'tap' || requestedInputMode === 'standard'
      ? requestedInputMode
      : playPreferences.inputMode
  const autoStartRequested =
    song.kind === 'folder' && location.state?.autoStart === true
  const loadingPhrase =
    typeof location.state?.loadingPhrase === 'string'
      ? location.state.loadingPhrase
      : 'Warming up the amp'
  const initialPracticeSpeed = normalizePracticeSpeed(
    location.state?.practiceSpeed ?? playPreferences.practiceSpeed,
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const outputLatencyRef = useRef<number | null>(null)
  const autoStartedRef = useRef(false)
  const tapControlsEntranceTimerRef = useRef<number | null>(null)
  const [phase, setPhase] = useState<Phase>(
    autoStartRequested ? 'loading' : 'ready',
  )
  const immersiveLoading = autoStartRequested && phase === 'loading'
  const [stats, setStats] = useState<SessionStats>(emptyStats)
  const [error, setError] = useState('')
  const [tapControlsEntering, setTapControlsEntering] = useState(false)
  const [practiceSpeed, setPracticeSpeed] =
    useState<PracticeSpeed>(initialPracticeSpeed)
  const [runInputOffsetMs, setRunInputOffsetMs] = useState(
    calibration.inputOffsetMs,
  )
  const [appliedOffsetMs, setAppliedOffsetMs] = useState<number | null>(null)
  const [runSaveState, setRunSaveState] = useState<RunSaveState>('idle')
  const [newPersonalBest, setNewPersonalBest] = useState(false)

  useEffect(() => {
    preloadGameplayVfx()
  }, [])

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
      tapMode: inputMode === 'tap',
    }),
    [
      backgroundImage,
      highwayImage,
      highwaySettings.missFeedback,
      inputMode,
      visualSettings.backgroundDim,
      visualSettings.highwayOpacity,
    ],
  )
  const highwayVisualsRef = useRef(highwayVisuals)
  highwayVisualsRef.current = highwayVisuals
  const gameplayChart = useMemo(
    () =>
      inputMode === 'tap' && song.kind === 'folder'
        ? adaptChartForHandiTap(song.chart)
        : song.chart,
    [inputMode, song.chart, song.kind],
  )
  const practiceSection = useMemo(() => {
    const requestedId = location.state?.practiceSection?.id
    if (typeof requestedId !== 'string') return null
    return (
      gameplayChart.practiceSections?.find(
        (section) => section.id === requestedId,
      ) ?? null
    )
  }, [gameplayChart.practiceSections, location.state])
  const practiceLoop = Boolean(
    practiceSection && location.state?.practiceLoop === true,
  )
  const activeNoteCount = useMemo(
    () =>
      practiceSection
        ? gameplayChart.notes.filter(
            (note) =>
              note.timeSeconds >= practiceSection.startTimeSeconds &&
              note.timeSeconds < practiceSection.endTimeSeconds,
          ).length
        : gameplayChart.notes.length,
    [gameplayChart.notes, practiceSection],
  )

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
        activeNoteCount,
        song.kind === 'calibration' ? 4 : 0,
      ),
    [activeNoteCount, song.kind, stats],
  )
  const loadingFrame = useMemo<GameFrame>(
    () => ({
      songTimeSeconds: -10,
      visualTimeSeconds: -10,
      heldLanes: [],
      noteStates: gameplayChart.notes.map(() => 'pending'),
      sustainStates: gameplayChart.notes.map(() => 'none'),
      starPowerPhraseStates: (gameplayChart.starPowerPhrases ?? []).map(
        () => 'pending',
      ),
      activeSustainIndices: [],
      stats: emptyStats,
      whammyAmount: 0,
      hitFlash: null,
      missFlash: null,
      starPowerPhraseFlash: null,
    }),
    [gameplayChart.notes, gameplayChart.starPowerPhrases],
  )
  const displayChart = useMemo(
    () =>
      song.kind === 'calibration'
        ? { ...gameplayChart, notes: [], starPowerPhrases: [] }
        : gameplayChart,
    [gameplayChart, song.kind],
  )

  const stopSession = () => {
    if (tapControlsEntranceTimerRef.current !== null) {
      window.clearTimeout(tapControlsEntranceTimerRef.current)
      tapControlsEntranceTimerRef.current = null
    }
    engineRef.current?.stop()
    engineRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }

  const triggerTapControlsEntrance = () => {
    if (inputMode !== 'tap') return
    if (tapControlsEntranceTimerRef.current !== null) {
      window.clearTimeout(tapControlsEntranceTimerRef.current)
    }
    setTapControlsEntering(true)
    tapControlsEntranceTimerRef.current = window.setTimeout(() => {
      setTapControlsEntering(false)
      tapControlsEntranceTimerRef.current = null
    }, 1050)
  }

  useEffect(() => stopSession, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!immersiveLoading || !canvas) return
    const drawLoadingHighway = () =>
      drawHighway(
        canvas,
        displayChart,
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
    displayChart,
  ])

  const startSession = async () => {
    stopSession()
    setTapControlsEntering(false)
    setPhase('loading')
    setStats(emptyStats)
    setError('')
    setRunInputOffsetMs(calibration.inputOffsetMs)
    setAppliedOffsetMs(null)
    setRunSaveState('idle')
    setNewPersonalBest(false)

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
      const outputLatency = audioContext.outputLatency
      if (Number.isFinite(outputLatency) && outputLatency >= 0) {
        outputLatencyRef.current = outputLatency
        observeOutputLatency(outputLatency)
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
        chart: gameplayChart,
        calibration: {
          ...calibration,
          audioOffsetMs:
            calibration.audioOffsetMs + (song.audioOffsetMs ?? 0),
        },
        controllerMapping,
        keyboardMapping,
        inputMode,
        playbackRate: practiceSpeed,
        practiceSection,
        practiceLoop,
        calibrationMode: song.kind === 'calibration',
        whammyBufferIndices: whammyBufferIndices(song),
        onFrame: (frame) => {
          if (canvasRef.current) {
            drawHighway(
              canvasRef.current,
              displayChart,
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

          if (song.kind !== 'folder') return
          if (practiceSection || practiceSpeed !== 1) {
            setRunSaveState('practice')
            return
          }
          if (session.kind === 'guest') {
            setRunSaveState('guest')
            return
          }
          const track = parseTrackChoice(song.chart)
          if (!track || session.kind !== 'profile') return
          const finalResults = calculateSessionResults(
            finalStats,
            activeNoteCount,
          )
          setRunSaveState('saving')
          void recordRun({
            chartKey: profileChartKey({
              songId: song.id,
              trackName: song.chart.trackName,
              inputMode,
            }),
            songId: song.id,
            songName: song.chart.metadata.name,
            artist: song.chart.metadata.artist,
            trackName: song.chart.trackName,
            difficulty: track.difficulty,
            instrumentId: track.instrumentId,
            inputMode,
            handiTapVersion: inputMode === 'tap' ? HANDITAP_VERSION : null,
            score: finalStats.score,
            accuracy: finalResults.noteAccuracy,
            fullCombo: finalResults.fullCombo,
            misses: finalStats.misses,
            overstrums: finalStats.overstrums,
            bestStreak: finalStats.bestStreak,
            hits: finalStats.hits,
            rank: finalResults.resultRank,
            starPowerActivations: finalStats.starPowerActivations,
            durationSeconds: gameplayChart.durationSeconds,
          }).then((result) => {
            setRunSaveState(result ? 'saved' : 'error')
            setNewPersonalBest(Boolean(result?.newPersonalBest))
          })
        },
        onPauseChange: (paused) => {
          setPhase(paused ? 'paused' : 'playing')
        },
      })

      engineRef.current = engine
      triggerTapControlsEntrance()
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
    const nextCalibration = timingLabCalibration({
      calibration,
      runInputOffsetMs,
      suggestedCorrectionMs: suggestedCorrection,
      outputLatencySeconds: outputLatencyRef.current,
      inputMode,
    })
    setCalibration(nextCalibration)
    if (outputLatencyRef.current !== null) {
      saveActiveTimingPresetLatency(outputLatencyRef.current)
    }
    setAppliedOffsetMs(nextCalibration.inputOffsetMs)
  }

  const togglePause = () => {
    engineRef.current?.togglePause()
  }

  const restartSession = () => {
    setStats(emptyStats)
    setAppliedOffsetMs(null)
    triggerTapControlsEntrance()
    engineRef.current?.restart()
  }

  const setSongSyncOffset = (offsetMs: number) => {
    if (song.kind !== 'folder') return
    const nextOffsetMs = Math.max(-250, Math.min(250, Math.round(offsetMs)))
    setSong({ ...song, audioOffsetMs: nextOffsetMs })
    engineRef.current?.setAudioOffsetMs(
      calibration.audioOffsetMs + nextOffsetMs,
    )
  }

  const setRunPracticeSpeed = (speed: PracticeSpeed) => {
    setPracticeSpeed(speed)
    setPlayPreferences({ ...playPreferences, practiceSpeed: speed })
    engineRef.current?.setPlaybackRate(speed)
  }

  const handleTap = useCallback(
    (
      lanes: Parameters<GameEngine['submitTap']>[0],
      timestamp: number,
    ) => {
      engineRef.current?.submitTap(lanes, timestamp)
    },
    [],
  )

  const handleTapLanesChange = useCallback(
    (lanes: Parameters<GameEngine['setTapLanes']>[0]) => {
      engineRef.current?.setTapLanes(lanes)
    },
    [],
  )

  const handleTapFretChange = useCallback(
    (
      lanes: Parameters<GameEngine['submitTapFretChange']>[0],
      timestamp: number,
    ) => {
      engineRef.current?.submitTapFretChange(lanes, timestamp)
    },
    [],
  )

  const handleTapSweep = useCallback(
    (
      pointerId: number,
      lane: Parameters<GameEngine['submitTapSweep']>[1],
      lanes: Parameters<GameEngine['submitTapSweep']>[2],
      timestamp: number,
    ) => {
      engineRef.current?.submitTapSweep(
        pointerId,
        lane,
        lanes,
        timestamp,
      )
    },
    [],
  )

  const handleTapSweepEnd = useCallback((pointerId: number) => {
    engineRef.current?.releaseTapSweep(pointerId)
  }, [])

  const handleTapStarPower = useCallback((timestamp: number) => {
    engineRef.current?.activateTapStarPower(timestamp)
  }, [])

  const handleTapWhammy = useCallback((amount: number) => {
    engineRef.current?.setTapWhammy(amount)
  }, [])

  const handleCalibrationTap = useCallback((timestamp: number) => {
    engineRef.current?.submitCalibrationHit(timestamp)
  }, [])

  useGameplayInteractionLock(phase === 'playing', () => {
    engineRef.current?.pause()
  })

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
        <BackIconButton
          label={song.kind === 'folder' ? 'Song selection' : 'Main menu'}
          onClick={() => {
            stopSession()
            navigate(song.kind === 'folder' ? '/songs' : '/')
          }}
        />
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
        <div
          className={styles.highwayWrap}
          data-gameplay-touch-surface={phase === 'playing' || undefined}
        >
          <HighwayCanvas ref={canvasRef} />

          {phase === 'playing' &&
            inputMode === 'standard' &&
            song.kind !== 'calibration' && (
              <StarPowerRail
                highwayLength={highwaySettings.length}
                hitLineRatio={DEFAULT_HIT_LINE_RATIO}
                active={stats.starPowerActive}
                charge={stats.starPowerMeter}
                interactive={false}
              />
            )}

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
                    {song.kind === 'calibration'
                      ? 'Play each beat naturally. Timing Lab aligns the audio route and hit detection for this setup.'
                      : inputMode === 'tap'
                        ? 'Tap a colored lane as its note reaches the target. Hold for sustains, drag a held fret upward to whammy, and use multiple fingers for chords.'
                        : 'Read the gem center: dark caps require a strum, white caps are HOPOs, and translucent glowing gems are taps.'}
                  </p>
                  {inputMode === 'standard' &&
                    song.kind !== 'calibration' && (
                    <div className={styles.noteLegend} aria-label="Note types">
                      <span data-note-type="strum"><i /> Strum</span>
                      <span data-note-type="hopo"><i /> HOPO</span>
                      <span data-note-type="tap"><i /> Tap</span>
                    </div>
                  )}
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
              noteCount={activeNoteCount}
              calibrationRun={song.kind === 'calibration'}
              inputMode={inputMode}
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
              playerName={activePlayerName}
              saveState={runSaveState}
              newPersonalBest={newPersonalBest}
            />
          )}

          {phase === 'playing' && song.kind === 'calibration' && (
            <div className={styles.audioCalibration}>
              <p>Audio-only calibration</p>
              <h1>Follow the clicks</h1>
              <span>
                {inputMode === 'tap'
                  ? 'Tap anywhere in this pad on each beat.'
                  : 'Strum once on each beat. No frets are needed.'}
              </span>
              {inputMode === 'tap' && (
                <button
                  type="button"
                  aria-label="Calibration tap pad"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    handleCalibrationTap(event.timeStamp)
                  }}
                >
                  Tap to the beat
                </button>
              )}
              <small>Close your eyes if it helps—there are no visual notes.</small>
            </div>
          )}

          {phase === 'playing' &&
            inputMode === 'tap' &&
            song.kind !== 'calibration' && (
            <TouchControls
              highwayLength={highwaySettings.length}
              entering={tapControlsEntering}
              starPowerActive={stats.starPowerActive}
              starPowerMeter={stats.starPowerMeter}
              onTap={handleTap}
              onFretChange={handleTapFretChange}
              onSweep={handleTapSweep}
              onSweepEnd={handleTapSweepEnd}
              onLanesChange={handleTapLanesChange}
              onStarPower={handleTapStarPower}
              onWhammy={handleTapWhammy}
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
            practiceSpeed={practiceSpeed}
            practiceSectionName={practiceSection?.name ?? null}
            onTogglePause={togglePause}
          />
        )}
      </section>

      {phase === 'paused' && (
        <PauseScreen
          song={song}
          stats={stats}
          songSyncOffsetMs={song.audioOffsetMs ?? 0}
          practiceSpeed={practiceSpeed}
          practiceSection={practiceSection}
          practiceLoop={practiceLoop}
          activeNoteCount={activeNoteCount}
          onSongSyncOffsetChange={setSongSyncOffset}
          onPracticeSpeedChange={setRunPracticeSpeed}
          onResume={togglePause}
          onRestart={restartSession}
          onLeave={stopSession}
        />
      )}
    </main>
  )
}
