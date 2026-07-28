import { secondsToTick } from '../lib/chartParser'
import { gamepadBindingActive } from '../lib/controllerInput'
import {
  directHidSnapshot,
  reconnectDirectHidDevice,
} from '../lib/directHidController'
import { hidBindingActive } from '../lib/hidInput'
import {
  canFretHit,
  HIT_WINDOW_MS,
  lanesMatchWithActiveSustains,
  multiplierForStreak,
  scoreForHit,
  sustainBasePointsAtTick,
  sustainLanesHeld,
  sustainReleaseExpired,
} from '../lib/scoring'
import {
  COUNTDOWN_SECONDS,
  createPlaybackSchedule,
  RESUME_LEAD_SECONDS,
} from './playbackTimeline'
import type {
  CalibrationSettings,
  ControllerMapping,
  GameFrame,
  Lane,
  ParsedChart,
  SessionStats,
  SustainState,
} from '../types/game'

interface GameEngineOptions {
  audioContext: AudioContext
  audioBuffers: AudioBuffer[]
  chart: ParsedChart
  calibration: CalibrationSettings
  controllerMapping: ControllerMapping | null
  onFrame: (frame: GameFrame) => void
  onStats: (stats: SessionStats) => void
  onFinish: (stats: SessionStats) => void
  onPauseChange: (paused: boolean) => void
}

const KEY_LANES = new Map<string, Lane>([
  ['KeyA', 0],
  ['KeyS', 1],
  ['KeyD', 2],
  ['KeyF', 3],
  ['KeyG', 4],
])

const STRUM_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown'])
const PAUSE_KEYS = new Set(['Escape', 'KeyP'])

function freshStats(): SessionStats {
  return {
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
}

function normalizePerformanceTimestamp(timestamp: number): number {
  if (timestamp > performance.timeOrigin) {
    return timestamp - performance.timeOrigin
  }
  return timestamp
}

export class GameEngine {
  private readonly audioContext: AudioContext
  private readonly audioBuffers: AudioBuffer[]
  private readonly chart: ParsedChart
  private readonly calibration: CalibrationSettings
  private readonly controllerMapping: ControllerMapping | null
  private readonly onFrame: (frame: GameFrame) => void
  private readonly onStats: (stats: SessionStats) => void
  private readonly onFinish: (stats: SessionStats) => void
  private readonly onPauseChange: (paused: boolean) => void
  private readonly sources: AudioBufferSourceNode[] = []
  private readonly keyboardLanes = new Set<Lane>()
  private readonly noteStates: Array<'pending' | 'hit' | 'miss'>
  private readonly sustainStates: SustainState[]
  private readonly sustainBasePointsAwarded: number[]
  private readonly sustainMismatchStartedAt: Array<number | null>
  private readonly activeSustains = new Set<number>()
  private readonly stats = freshStats()

  private startContextTime = 0
  private frameRequest = 0
  private missCursor = 0
  private lastHitNoteIndex: number | null = null
  private stopped = false
  private finished = false
  private paused = false
  private pausedSongTimeSeconds = 0
  private previousGamepadStrum = false
  private gamepadLanes: Lane[] = []
  private hitFlash: GameFrame['hitFlash'] = null
  private lastStatsPush = 0
  private mixGain: GainNode | null = null

  constructor(options: GameEngineOptions) {
    this.audioContext = options.audioContext
    this.audioBuffers = options.audioBuffers
    this.chart = options.chart
    this.calibration = options.calibration
    this.controllerMapping = options.controllerMapping
    if (this.controllerMapping?.source === 'hid') {
      void reconnectDirectHidDevice(this.controllerMapping.device)
    }
    this.onFrame = options.onFrame
    this.onStats = options.onStats
    this.onFinish = options.onFinish
    this.onPauseChange = options.onPauseChange
    this.noteStates = options.chart.notes.map(() => 'pending')
    this.sustainStates = options.chart.notes.map(() => 'none')
    this.sustainBasePointsAwarded = options.chart.notes.map(() => 0)
    this.sustainMismatchStartedAt = options.chart.notes.map(() => null)
  }

  start(): void {
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    this.restart()
  }

  restart(): void {
    if (this.stopped) return
    cancelAnimationFrame(this.frameRequest)
    this.stopSources()
    this.noteStates.fill('pending')
    this.sustainStates.fill('none')
    this.sustainBasePointsAwarded.fill(0)
    this.sustainMismatchStartedAt.fill(null)
    this.activeSustains.clear()
    Object.assign(this.stats, freshStats())
    this.missCursor = 0
    this.lastHitNoteIndex = null
    this.finished = false
    this.paused = false
    this.pausedSongTimeSeconds = -COUNTDOWN_SECONDS
    this.hitFlash = null
    this.lastStatsPush = 0
    this.schedulePlayback(-COUNTDOWN_SECONDS)
    this.pushStats()
    this.onPauseChange(false)
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  pause(): void {
    if (this.stopped || this.finished || this.paused) return
    this.pausedSongTimeSeconds = this.songTimeAt(performance.now())
    this.paused = true
    cancelAnimationFrame(this.frameRequest)
    this.stopSources()
    this.onPauseChange(true)
  }

  resume(): void {
    if (this.stopped || this.finished || !this.paused) return
    this.schedulePlayback(
      this.pausedSongTimeSeconds,
      RESUME_LEAD_SECONDS,
    )
    this.paused = false
    this.onPauseChange(false)
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  togglePause(): void {
    if (this.paused) {
      this.resume()
    } else {
      this.pause()
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    cancelAnimationFrame(this.frameRequest)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    this.stopSources()
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // A source that naturally ended cannot be stopped again.
      }
    }
    this.sources.length = 0
  }

  private schedulePlayback(
    songTimeSeconds: number,
    leadSeconds = 0,
  ): void {
    if (!this.mixGain) {
      this.mixGain = this.audioContext.createGain()
      this.mixGain.gain.value =
        this.audioBuffers.length > 1 ? 0.82 : 0.95
      this.mixGain.connect(this.audioContext.destination)
    }

    const schedule = createPlaybackSchedule(
      this.audioContext.currentTime,
      songTimeSeconds,
      leadSeconds,
    )
    this.startContextTime = schedule.audioStartContextTime

    for (const buffer of this.audioBuffers) {
      if (schedule.sourceOffsetSeconds >= buffer.duration) continue
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.mixGain)
      source.start(
        schedule.sourceStartContextTime,
        schedule.sourceOffsetSeconds,
      )
      this.sources.push(source)
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (PAUSE_KEYS.has(event.code)) {
      event.preventDefault()
      if (!event.repeat) this.togglePause()
      return
    }

    const lane = KEY_LANES.get(event.code)
    if (lane !== undefined) {
      event.preventDefault()
      this.keyboardLanes.add(lane)
      if (!event.repeat) {
        this.fretChange(
          normalizePerformanceTimestamp(event.timeStamp),
        )
      }
      return
    }

    if (STRUM_KEYS.has(event.code)) {
      event.preventDefault()
      if (!event.repeat) this.strum(normalizePerformanceTimestamp(event.timeStamp))
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const lane = KEY_LANES.get(event.code)
    if (lane !== undefined) {
      event.preventDefault()
      this.keyboardLanes.delete(lane)
      this.fretChange(normalizePerformanceTimestamp(event.timeStamp))
    }
  }

  private audioTimeAt(performanceTime: number): number {
    const timestamp = this.audioContext.getOutputTimestamp()
    const outputPerformanceTime = timestamp.performanceTime
    const outputContextTime = timestamp.contextTime
    if (
      outputPerformanceTime !== undefined &&
      outputContextTime !== undefined &&
      outputPerformanceTime > 0
    ) {
      return (
        outputContextTime +
        (performanceTime - outputPerformanceTime) / 1000
      )
    }
    return this.audioContext.currentTime
  }

  private songTimeAt(performanceTime: number): number {
    return this.audioTimeAt(performanceTime) - this.startContextTime
  }

  private heldLanes(): Lane[] {
    return [...new Set([...this.keyboardLanes, ...this.gamepadLanes])].sort(
      (a, b) => a - b,
    )
  }

  private activeSustainLanes(): Lane[] {
    const lanes = new Set<Lane>()
    for (const noteIndex of this.activeSustains) {
      for (const lane of this.chart.notes[noteIndex].lanes) {
        lanes.add(lane)
      }
    }
    return [...lanes]
  }

  private readGamepad(now: number): void {
    if (!this.controllerMapping) return
    if (this.controllerMapping.source === 'hid') {
      const snapshot = directHidSnapshot(this.controllerMapping.device)
      const previousLanes = this.gamepadLanes
      this.gamepadLanes = this.controllerMapping.frets
        .map((binding, index) =>
          hidBindingActive(snapshot.reports, binding)
            ? (index as Lane)
            : null,
        )
        .filter((lane): lane is Lane => lane !== null)
      const fretsChanged =
        previousLanes.length !== this.gamepadLanes.length ||
        previousLanes.some((lane) => !this.gamepadLanes.includes(lane))
      const strumming =
        hidBindingActive(snapshot.reports, this.controllerMapping.strumUp) ||
        hidBindingActive(snapshot.reports, this.controllerMapping.strumDown)
      const timestamp = snapshot.timestamp || now

      if (strumming && !this.previousGamepadStrum) {
        this.strum(timestamp)
      } else if (fretsChanged) {
        this.fretChange(timestamp)
      }
      this.previousGamepadStrum = strumming
      return
    }

    const mapping = this.controllerMapping
    const gamepads = navigator.getGamepads?.() ?? []
    const gamepad =
      gamepads[mapping.gamepadIndex] ??
      [...gamepads].find(
        (candidate) => candidate?.id === mapping.gamepadId,
      )
    if (!gamepad) {
      this.gamepadLanes = []
      this.previousGamepadStrum = false
      return
    }

    const previousLanes = this.gamepadLanes
    this.gamepadLanes = mapping.frets
      .map((binding, index) =>
        gamepadBindingActive(gamepad, binding) ? (index as Lane) : null,
      )
      .filter((lane): lane is Lane => lane !== null)
    const fretsChanged =
      previousLanes.length !== this.gamepadLanes.length ||
      previousLanes.some((lane) => !this.gamepadLanes.includes(lane))

    const strumming =
      gamepadBindingActive(gamepad, mapping.strumUp) ||
      gamepadBindingActive(gamepad, mapping.strumDown)

    if (strumming && !this.previousGamepadStrum) {
      const timestamp =
        gamepad.timestamp > 0
          ? normalizePerformanceTimestamp(gamepad.timestamp)
          : now
      this.strum(timestamp)
    } else if (fretsChanged) {
      const timestamp =
        gamepad.timestamp > 0
          ? normalizePerformanceTimestamp(gamepad.timestamp)
          : now
      this.fretChange(timestamp)
    }
    this.previousGamepadStrum = strumming
  }

  private strum(performanceTime: number): void {
    if (this.attemptHit(performanceTime, 'strum')) return
    if (this.stopped || this.finished || this.paused) return
    if (this.songTimeAt(performanceTime) < 0) return

    this.stats.overstrums += 1
    this.stats.streak = 0
    this.lastHitNoteIndex = null
    this.pushStats()
  }

  private fretChange(performanceTime: number): void {
    this.attemptHit(performanceTime, 'fret')
  }

  private attemptHit(
    performanceTime: number,
    inputType: 'strum' | 'fret',
  ): boolean {
    if (this.stopped || this.finished || this.paused) return false
    const rawSongTime = this.songTimeAt(performanceTime)
    if (rawSongTime < 0) return false
    const scoringTime =
      rawSongTime - this.calibration.inputOffsetMs / 1000
    const windowSeconds = HIT_WINDOW_MS / 1000

    let candidateIndex = -1
    let candidateDistance = Number.POSITIVE_INFINITY

    for (
      let index = this.missCursor;
      index < this.chart.notes.length;
      index += 1
    ) {
      if (this.noteStates[index] !== 'pending') continue
      const note = this.chart.notes[index]
      if (note.timeSeconds > scoringTime + windowSeconds) break
      if (
        inputType === 'fret' &&
        !canFretHit(
          note,
          index > 0 &&
            this.lastHitNoteIndex === index - 1 &&
            this.noteStates[index - 1] === 'hit',
        )
      ) {
        continue
      }
      const distance = Math.abs(
        scoringTime - note.timeSeconds,
      )
      if (distance <= windowSeconds && distance < candidateDistance) {
        candidateIndex = index
        candidateDistance = distance
      }
    }

    if (
      candidateIndex === -1 ||
      !lanesMatchWithActiveSustains(
        this.chart.notes[candidateIndex],
        this.heldLanes(),
        this.activeSustainLanes(),
      )
    ) {
      return false
    }

    const note = this.chart.notes[candidateIndex]
    const errorMs = (scoringTime - note.timeSeconds) * 1000
    this.noteStates[candidateIndex] = 'hit'
    if (note.sustainTicks > 0 && note.sustainSeconds > 0.03) {
      this.sustainStates[candidateIndex] = 'holding'
      this.activeSustains.add(candidateIndex)
    }
    this.stats.score += scoreForHit(
      Math.max(1, note.lanes.length),
      this.stats.streak,
    )
    this.stats.streak += 1
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak)
    this.stats.hits += 1
    this.lastHitNoteIndex = candidateIndex
    this.stats.lastErrorMs = errorMs
    this.stats.records.push({
      noteIndex: candidateIndex,
      errorMs,
      result: 'hit',
    })
    this.hitFlash = {
      lanes: note.lanes,
      open: note.open,
      startedAt: rawSongTime,
      expiresAt: rawSongTime + 0.26,
    }
    this.advanceMissCursor()
    this.pushStats()
    return true
  }

  private updateSustains(scoringTime: number): void {
    if (this.activeSustains.size === 0) return

    const heldLanes = this.heldLanes()
    let changed = false

    for (const noteIndex of this.activeSustains) {
      const note = this.chart.notes[noteIndex]
      const sustainEndTime = note.timeSeconds + note.sustainSeconds
      const sustainFinished = scoringTime >= sustainEndTime
      const matchingFrets = sustainLanesHeld(note, heldLanes)

      if (!matchingFrets && !sustainFinished) {
        const mismatchStartedAt =
          this.sustainMismatchStartedAt[noteIndex]
        if (mismatchStartedAt === null) {
          this.sustainMismatchStartedAt[noteIndex] = scoringTime
        } else if (sustainReleaseExpired(mismatchStartedAt, scoringTime)) {
          this.sustainStates[noteIndex] = 'released'
          this.stats.sustainsBroken += 1
          this.activeSustains.delete(noteIndex)
          changed = true
          continue
        }
      } else {
        this.sustainMismatchStartedAt[noteIndex] = null
      }

      const currentTick = secondsToTick(
        Math.min(scoringTime, sustainEndTime),
        this.chart.tempos,
        this.chart.metadata.resolution,
        this.chart.metadata.offsetSeconds,
      )
      const targetBasePoints = sustainBasePointsAtTick(
        note,
        currentTick,
        this.chart.metadata.resolution,
      )
      const unawardedBasePoints =
        targetBasePoints - this.sustainBasePointsAwarded[noteIndex]

      if (unawardedBasePoints > 0) {
        const awardedPoints =
          unawardedBasePoints * multiplierForStreak(this.stats.streak)
        this.sustainBasePointsAwarded[noteIndex] = targetBasePoints
        this.stats.score += awardedPoints
        this.stats.sustainPoints += awardedPoints
        changed = true
      }

      if (sustainFinished) {
        this.sustainStates[noteIndex] = 'complete'
        this.stats.sustainsCompleted += 1
        this.activeSustains.delete(noteIndex)
        changed = true
      }
    }

    if (changed) this.pushStats()
  }

  private markMisses(scoringTime: number): void {
    const windowSeconds = HIT_WINDOW_MS / 1000
    let changed = false

    while (
      this.missCursor < this.chart.notes.length &&
      this.chart.notes[this.missCursor].timeSeconds + windowSeconds <
        scoringTime
    ) {
      if (this.noteStates[this.missCursor] === 'pending') {
        this.noteStates[this.missCursor] = 'miss'
        this.stats.misses += 1
        this.stats.streak = 0
        this.lastHitNoteIndex = null
        this.stats.records.push({
          noteIndex: this.missCursor,
          errorMs: HIT_WINDOW_MS,
          result: 'miss',
        })
        changed = true
      }
      this.missCursor += 1
    }

    if (changed) this.pushStats()
  }

  private advanceMissCursor(): void {
    while (
      this.missCursor < this.noteStates.length &&
      this.noteStates[this.missCursor] !== 'pending'
    ) {
      this.missCursor += 1
    }
  }

  private pushStats(): void {
    this.onStats(this.snapshotStats())
  }

  private snapshotStats(): SessionStats {
    return { ...this.stats, records: [...this.stats.records] }
  }

  private readonly tick = (now: number): void => {
    if (this.stopped) return
    const songTimeSeconds = this.songTimeAt(now)
    const scoringTime =
      songTimeSeconds - this.calibration.inputOffsetMs / 1000

    this.readGamepad(now)
    this.updateSustains(scoringTime)
    this.markMisses(scoringTime)
    if (this.hitFlash && this.hitFlash.expiresAt < songTimeSeconds) {
      this.hitFlash = null
    }

    if (now - this.lastStatsPush > 100) {
      this.lastStatsPush = now
      this.pushStats()
    }

    this.onFrame({
      songTimeSeconds,
      visualTimeSeconds:
        songTimeSeconds + this.calibration.videoOffsetMs / 1000,
      heldLanes: this.heldLanes(),
      noteStates: this.noteStates,
      sustainStates: this.sustainStates,
      stats: this.stats,
      hitFlash: this.hitFlash,
    })

    const audioDuration = Math.max(
      ...this.audioBuffers.map((buffer) => buffer.duration),
    )
    const endTime = Math.max(audioDuration, this.chart.durationSeconds)
    if (songTimeSeconds > endTime + 0.35) {
      this.finished = true
      const finalStats = this.snapshotStats()
      this.stop()
      this.onFinish(finalStats)
      return
    }

    this.frameRequest = requestAnimationFrame(this.tick)
  }
}
