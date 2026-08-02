import { secondsToTick } from '../lib/chartParser'
import { reconnectDirectHidDevice } from '../lib/directHidController'
import { keyboardEventCode } from '../lib/keyboardMapping'
import {
  canFretHit,
  HIT_WINDOW_MS,
  lanesMatchWithActiveSustains,
  scoreForHit,
  scoreMultiplier,
  sustainBasePointsAtTick,
  sustainLanesHeld,
  sustainReleaseExpired,
} from '../lib/scoring'
import {
  chartTimeForPlayback,
  COUNTDOWN_SECONDS,
  createPlaybackSchedule,
  RESUME_LEAD_SECONDS,
} from './playbackTimeline'
import {
  addStarPowerPhrase,
  addWhammyStarPower,
  canActivateStarPower,
  drainStarPower,
  isWhammyStarPowerSustain,
} from '../lib/starPower'
import { whammyAudioParameters } from './whammyAudio'
import { playStarPowerIgnition } from './starPowerIgnitionAudio'
import type { PlayInputMode } from '../lib/inputMode'
import {
  normalizePerformanceTimestamp,
  readControllerState,
} from './input/controllerState'
import {
  closestHitCandidate,
  frontendHopoCandidate,
  type NoteJudgementState,
} from './input/hitCandidate'
import {
  findHandiTapBurstReentry,
  handiTapSustainReleaseExpired,
  isPartialHandiTapChord,
} from './input/tapInput'
import { TapSweepBuffer } from './input/tapSweepBuffer'
import type {
  CalibrationSettings,
  ControllerMapping,
  GameFrame,
  KeyboardMapping,
  Lane,
  ParsedChart,
  PracticeSection,
  SessionStats,
  StarPowerPhraseState,
  SustainState,
} from '../types/game'

interface GameEngineOptions {
  audioContext: AudioContext
  audioBuffers: AudioBuffer[]
  chart: ParsedChart
  calibration: CalibrationSettings
  controllerMapping: ControllerMapping | null
  keyboardMapping: KeyboardMapping
  inputMode?: PlayInputMode
  playbackRate?: number
  practiceSection?: PracticeSection | null
  practiceLoop?: boolean
  calibrationMode?: boolean
  whammyBufferIndices?: number[]
  onFrame: (frame: GameFrame) => void
  onStats: (stats: SessionStats) => void
  onFinish: (stats: SessionStats) => void
  onPauseChange: (paused: boolean) => void
}

interface WhammyEffectNodes {
  delay: DelayNode
  modulationDepth: GainNode
  oscillator: OscillatorNode
}

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
    starPowerMeter: 0,
    starPowerActive: false,
    starPowerPhrasesHit: 0,
    starPowerPhrasesMissed: 0,
    starPowerActivations: 0,
    lastErrorMs: null,
    records: [],
  }
}

export class GameEngine {
  private readonly audioContext: AudioContext
  private readonly audioBuffers: AudioBuffer[]
  private readonly chart: ParsedChart
  private readonly calibration: CalibrationSettings
  private audioOffsetMs: number
  private readonly controllerMapping: ControllerMapping | null
  private readonly keyboardMapping: KeyboardMapping
  private readonly inputMode: PlayInputMode
  private playbackRate: number
  private readonly practiceStartSeconds: number
  private readonly practiceEndSeconds: number
  private readonly practiceLoop: boolean
  private readonly calibrationMode: boolean
  private readonly whammyBufferIndices: ReadonlySet<number>
  private readonly keyboardLanesByCode: Map<string, Lane>
  private readonly onFrame: (frame: GameFrame) => void
  private readonly onStats: (stats: SessionStats) => void
  private readonly onFinish: (stats: SessionStats) => void
  private readonly onPauseChange: (paused: boolean) => void
  private readonly endTimeSeconds: number
  private readonly sources: AudioBufferSourceNode[] = []
  private readonly whammyEffects: WhammyEffectNodes[] = []
  private readonly keyboardLanes = new Set<Lane>()
  private readonly tapSweepBuffer = new TapSweepBuffer()
  private touchLanes: Lane[] = []
  private readonly noteStates: NoteJudgementState[]
  private readonly sustainStates: SustainState[]
  private readonly sustainBasePointsAwarded: number[]
  private readonly sustainMismatchStartedAt: Array<number | null>
  private readonly activeSustains = new Set<number>()
  private readonly starPowerPhraseStates: StarPowerPhraseState[]
  private readonly starPowerPhraseNoteIndices: number[][]
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
  private previousGamepadStarPower = false
  private gamepadLanes: Lane[] = []
  private gamepadWhammy = 0
  private keyboardWhammy = false
  private touchWhammy = 0
  private lastStarPowerTick: number | null = null
  private lastWhammyAudioAmount = -1
  private hitFlash: GameFrame['hitFlash'] = null
  private missFlash: GameFrame['missFlash'] = null
  private starPowerFlash: GameFrame['starPowerFlash'] = null
  private starPowerPhraseFlash: GameFrame['starPowerPhraseFlash'] = null
  private lastStatsPush = 0
  private statsDirty = true
  private recordsSnapshot: SessionStats['records'] = []
  private recordsDirty = true
  private mixGain: GainNode | null = null
  private bufferedHopoNoteIndex: number | null = null

  constructor(options: GameEngineOptions) {
    this.audioContext = options.audioContext
    this.audioBuffers = options.audioBuffers
    this.chart = options.chart
    this.calibration = options.calibration
    this.audioOffsetMs = options.calibration.audioOffsetMs
    this.controllerMapping = options.controllerMapping
    this.keyboardMapping = options.keyboardMapping
    this.inputMode = options.inputMode ?? 'standard'
    this.playbackRate = Math.max(0.25, Math.min(1, options.playbackRate ?? 1))
    this.practiceStartSeconds = Math.max(
      0,
      options.practiceSection?.startTimeSeconds ?? 0,
    )
    this.practiceEndSeconds = Math.max(
      this.practiceStartSeconds,
      options.practiceSection?.endTimeSeconds ?? Number.POSITIVE_INFINITY,
    )
    this.practiceLoop = Boolean(options.practiceSection && options.practiceLoop)
    this.calibrationMode = options.calibrationMode ?? false
    this.whammyBufferIndices = new Set(options.whammyBufferIndices ?? [])
    this.keyboardLanesByCode = new Map(
      options.keyboardMapping.frets.map((code, index) => [
        code,
        index as Lane,
      ]),
    )
    if (
      this.inputMode === 'standard' &&
      this.controllerMapping?.source === 'hid'
    ) {
      void reconnectDirectHidDevice(this.controllerMapping.device)
    }
    this.onFrame = options.onFrame
    this.onStats = options.onStats
    this.onFinish = options.onFinish
    this.onPauseChange = options.onPauseChange
    this.endTimeSeconds = Math.max(
      ...options.audioBuffers.map((buffer) => buffer.duration),
      options.chart.durationSeconds,
    )
    this.noteStates = options.chart.notes.map(() => 'pending')
    this.sustainStates = options.chart.notes.map(() => 'none')
    this.sustainBasePointsAwarded = options.chart.notes.map(() => 0)
    this.sustainMismatchStartedAt = options.chart.notes.map(() => null)
    this.starPowerPhraseStates = (options.chart.starPowerPhrases ?? []).map(
      () => 'pending',
    )
    this.starPowerPhraseNoteIndices = (
      options.chart.starPowerPhrases ?? []
    ).map((_, phraseIndex) =>
      options.chart.notes.flatMap((note, noteIndex) =>
        note.starPowerPhraseIndices?.includes(phraseIndex)
          ? [noteIndex]
          : [],
      ),
    )
  }

  start(): void {
    if (this.inputMode === 'standard') {
      window.addEventListener('keydown', this.handleKeyDown)
      window.addEventListener('keyup', this.handleKeyUp)
    }
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
    this.starPowerPhraseStates.fill('pending')
    Object.assign(this.stats, freshStats())
    this.missCursor = this.chart.notes.findIndex(
      (note) => note.timeSeconds >= this.practiceStartSeconds,
    )
    if (this.missCursor < 0) this.missCursor = this.chart.notes.length
    for (let index = 0; index < this.missCursor; index += 1) {
      this.noteStates[index] = 'hit'
    }
    this.lastHitNoteIndex = null
    this.finished = false
    this.paused = false
    this.pausedSongTimeSeconds = -COUNTDOWN_SECONDS
    this.hitFlash = null
    this.missFlash = null
    this.starPowerFlash = null
    this.starPowerPhraseFlash = null
    this.lastStarPowerTick = null
    this.lastWhammyAudioAmount = -1
    this.previousGamepadStrum = false
    this.previousGamepadStarPower = false
    this.gamepadWhammy = 0
    this.keyboardWhammy = false
    this.touchLanes = []
    this.touchWhammy = 0
    this.tapSweepBuffer.reset()
    this.bufferedHopoNoteIndex = null
    this.lastStatsPush = 0
    this.statsDirty = true
    this.recordsSnapshot = []
    this.recordsDirty = true
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
    this.mixGain?.disconnect()
    this.mixGain = null
    this.tapSweepBuffer.reset()
    this.bufferedHopoNoteIndex = null
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

  submitTap(lanes: Lane[], eventTimestamp: number): void {
    if (this.inputMode !== 'tap') return
    this.touchLanes = [...new Set(lanes)].sort((a, b) => a - b)
    const performanceTime = normalizePerformanceTimestamp(eventTimestamp)
    if (this.attemptHit(performanceTime, 'tap')) return
    if (this.attemptHandiTapBurstReentry(performanceTime)) return
    if (this.isPartialTapChordAt(performanceTime)) return
    this.recordOverstrum(performanceTime)
  }

  submitCalibrationHit(eventTimestamp: number): void {
    if (!this.calibrationMode) return
    const performanceTime = normalizePerformanceTimestamp(eventTimestamp)
    if (this.attemptHit(performanceTime, 'calibration')) return
    this.recordOverstrum(performanceTime)
  }

  submitTapFretChange(lanes: Lane[], eventTimestamp: number): void {
    if (this.inputMode !== 'tap') return
    this.touchLanes = [...new Set(lanes)].sort((a, b) => a - b)
    this.attemptHit(
      normalizePerformanceTimestamp(eventTimestamp),
      this.touchLanes.length === 0 ? 'tap-open-release' : 'tap-slide',
    )
  }

  submitTapSweep(
    pointerId: number,
    lane: Lane,
    lanes: Lane[],
    eventTimestamp: number,
  ): void {
    if (this.inputMode !== 'tap') return
    this.touchLanes = [...new Set(lanes)].sort((a, b) => a - b)
    const performanceTime = normalizePerformanceTimestamp(eventTimestamp)
    const rawSongTime = this.songTimeAt(performanceTime)
    const scoringTime =
      rawSongTime - this.calibration.inputOffsetMs / 1000
    if (scoringTime >= 0) {
      this.tapSweepBuffer.record(pointerId, lane, scoringTime)
      this.attemptBufferedTapSweep(rawSongTime, scoringTime)
    }
  }

  releaseTapSweep(pointerId: number): void {
    this.tapSweepBuffer.release(pointerId)
  }

  setTapLanes(lanes: Lane[]): void {
    if (this.inputMode !== 'tap') return
    this.touchLanes = [...new Set(lanes)].sort((a, b) => a - b)
  }

  setTapWhammy(amount: number): void {
    if (this.inputMode !== 'tap') return
    this.touchWhammy = Math.max(0, Math.min(1, amount))
  }

  activateTapStarPower(eventTimestamp: number): void {
    if (this.inputMode !== 'tap') return
    this.activateStarPower(normalizePerformanceTimestamp(eventTimestamp))
  }

  setAudioOffsetMs(offsetMs: number): void {
    if (!Number.isFinite(offsetMs)) return
    this.audioOffsetMs = Math.max(-400, Math.min(400, offsetMs))
  }

  setPlaybackRate(playbackRate: number): void {
    if (!this.paused || !Number.isFinite(playbackRate)) return
    this.playbackRate = Math.max(0.25, Math.min(1, playbackRate))
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    cancelAnimationFrame(this.frameRequest)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    this.stopSources()
    this.tapSweepBuffer.reset()
    this.mixGain?.disconnect()
    this.mixGain = null
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // A source that naturally ended cannot be stopped again.
      }
      source.disconnect()
    }
    for (const effect of this.whammyEffects) {
      try {
        effect.oscillator.stop()
      } catch {
        // An oscillator that already stopped cannot be stopped again.
      }
      effect.oscillator.disconnect()
      effect.modulationDepth.disconnect()
      effect.delay.disconnect()
    }
    this.sources.length = 0
    this.whammyEffects.length = 0
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
      this.audioOffsetMs / 1000,
      this.playbackRate,
      this.practiceStartSeconds,
    )
    this.startContextTime = schedule.chartStartContextTime

    this.lastWhammyAudioAmount = -1
    for (const [bufferIndex, buffer] of this.audioBuffers.entries()) {
      if (schedule.sourceOffsetSeconds >= buffer.duration) continue
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = this.playbackRate
      if (this.whammyBufferIndices.has(bufferIndex)) {
        const delay = this.audioContext.createDelay(0.05)
        const oscillator = this.audioContext.createOscillator()
        const modulationDepth = this.audioContext.createGain()
        delay.delayTime.value = 0
        oscillator.frequency.value = 5
        modulationDepth.gain.value = 0
        oscillator.connect(modulationDepth)
        modulationDepth.connect(delay.delayTime)
        source.connect(delay)
        delay.connect(this.mixGain)
        oscillator.start()
        this.whammyEffects.push({
          delay,
          modulationDepth,
          oscillator,
        })
      } else {
        source.connect(this.mixGain)
      }
      source.start(
        schedule.sourceStartContextTime,
        schedule.sourceOffsetSeconds,
      )
      this.sources.push(source)
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const code = keyboardEventCode(event)
    if (code === this.keyboardMapping.pause) {
      event.preventDefault()
      if (!event.repeat) this.togglePause()
      return
    }

    if (code === this.keyboardMapping.starPower) {
      event.preventDefault()
      if (!event.repeat) {
        this.activateStarPower(
          normalizePerformanceTimestamp(event.timeStamp),
        )
      }
      return
    }

    if (code === this.keyboardMapping.whammy) {
      event.preventDefault()
      this.keyboardWhammy = true
      return
    }

    const lane = this.keyboardLanesByCode.get(code)
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

    if (
      code === this.keyboardMapping.strumUp ||
      code === this.keyboardMapping.strumDown
    ) {
      event.preventDefault()
      if (!event.repeat) {
        this.strum(normalizePerformanceTimestamp(event.timeStamp))
      }
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const code = keyboardEventCode(event)
    if (code === this.keyboardMapping.whammy) {
      event.preventDefault()
      this.keyboardWhammy = false
      return
    }

    const lane = this.keyboardLanesByCode.get(code)
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
    const elapsedContextTime =
      this.audioTimeAt(performanceTime) - this.startContextTime
    const relativeTime = chartTimeForPlayback(
      elapsedContextTime,
      this.playbackRate,
    )
    return relativeTime < 0
      ? relativeTime
      : this.practiceStartSeconds + relativeTime
  }

  private attemptHandiTapBurstReentry(performanceTime: number): boolean {
    if (this.inputMode !== 'tap') return false
    const rawSongTime = this.songTimeAt(performanceTime)
    if (rawSongTime < 0) return false
    const scoringTime =
      rawSongTime - this.calibration.inputOffsetMs / 1000
    const marker = findHandiTapBurstReentry(
      this.chart.handiTapBurstMarkers ?? [],
      this.noteStates,
      this.sustainStates,
      this.heldLanes(),
      scoringTime,
      HIT_WINDOW_MS / 1000,
    )
    if (!marker) return false

    const noteIndex = marker.parentNoteIndex
    const note = this.chart.notes[noteIndex]
    if (!note) return false
    this.noteStates[noteIndex] = 'hit'
    this.sustainStates[noteIndex] = 'holding'
    this.sustainMismatchStartedAt[noteIndex] = null
    this.activeSustains.add(noteIndex)
    const currentTick = secondsToTick(
      scoringTime,
      this.chart.tempos,
      this.chart.metadata.resolution,
      this.chart.metadata.offsetSeconds,
    )
    this.sustainBasePointsAwarded[noteIndex] = sustainBasePointsAtTick(
      note,
      currentTick,
      this.chart.metadata.resolution,
    )
    this.stats.score += scoreForHit(1, this.stats.streak, this.stats.starPowerActive)
    this.stats.streak += 1
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak)
    this.stats.hits += 1
    const errorMs = (scoringTime - marker.timeSeconds) * 1000
    this.stats.lastErrorMs = errorMs
    this.stats.records.push({ noteIndex, errorMs, result: 'hit' })
    this.recordsDirty = true
    this.hitFlash = {
      lanes: [marker.lane],
      open: false,
      startedAt: rawSongTime,
      expiresAt: rawSongTime + 0.26,
    }
    this.pushStats()
    return true
  }

  private heldLanes(): Lane[] {
    return [
      ...new Set([
        ...this.keyboardLanes,
        ...this.gamepadLanes,
        ...this.touchLanes,
      ]),
    ].sort((a, b) => a - b)
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

  private whammyAmount(): number {
    return Math.max(
      this.keyboardWhammy ? 1 : 0,
      this.gamepadWhammy,
      this.touchWhammy,
    )
  }

  private whammyStarPowerSustainActive(scoringTime: number): boolean {
    if (this.whammyAmount() < 0.08) return false
    for (const noteIndex of this.activeSustains) {
      const note = this.chart.notes[noteIndex]
      if (
        isWhammyStarPowerSustain(
          note,
          this.sustainStates[noteIndex],
          scoringTime,
        )
      ) {
        return true
      }
    }
    return false
  }

  private heldSustainActive(scoringTime: number): boolean {
    for (const noteIndex of this.activeSustains) {
      const note = this.chart.notes[noteIndex]
      if (
        this.sustainStates[noteIndex] === 'holding' &&
        scoringTime < note.timeSeconds + note.sustainSeconds
      ) {
        return true
      }
    }
    return false
  }

  private updateWhammyAudio(scoringTime: number): void {
    const amount = this.heldSustainActive(scoringTime)
      ? this.whammyAmount()
      : 0
    if (Math.abs(amount - this.lastWhammyAudioAmount) < 0.02) return
    this.lastWhammyAudioAmount = amount
    const now = this.audioContext.currentTime
    const parameters = whammyAudioParameters(amount)
    for (const effect of this.whammyEffects) {
      effect.delay.delayTime.setTargetAtTime(
        parameters.baseDelaySeconds,
        now,
        0.025,
      )
      effect.modulationDepth.gain.setTargetAtTime(
        parameters.modulationDepthSeconds,
        now,
        0.025,
      )
      effect.oscillator.frequency.setTargetAtTime(
        parameters.modulationFrequencyHz,
        now,
        0.025,
      )
    }
  }

  private readGamepad(now: number): void {
    const snapshot = readControllerState(this.controllerMapping, now)
    if (!snapshot) {
      this.gamepadWhammy = 0
      return
    }
    if (!snapshot.connected) {
      this.gamepadLanes = []
      this.gamepadWhammy = 0
      this.previousGamepadStrum = false
      this.previousGamepadStarPower = false
      return
    }

    const previousLanes = this.gamepadLanes
    this.gamepadLanes = snapshot.lanes
    this.gamepadWhammy = snapshot.whammy
    const fretsChanged =
      previousLanes.length !== this.gamepadLanes.length ||
      previousLanes.some((lane) => !this.gamepadLanes.includes(lane))

    if (snapshot.strumming && !this.previousGamepadStrum) {
      this.strum(snapshot.timestamp)
    } else if (fretsChanged) {
      this.fretChange(snapshot.timestamp)
    }
    if (snapshot.starPower && !this.previousGamepadStarPower) {
      this.activateStarPower(snapshot.timestamp)
    }
    this.previousGamepadStrum = snapshot.strumming
    this.previousGamepadStarPower = snapshot.starPower
  }

  private activateStarPower(performanceTime: number): void {
    if (
      this.stopped ||
      this.finished ||
      this.paused ||
      !canActivateStarPower(
        this.stats.starPowerMeter,
        this.stats.starPowerActive,
      )
    ) {
      return
    }

    const scoringTime =
      this.songTimeAt(performanceTime) -
      this.calibration.inputOffsetMs / 1000
    if (scoringTime < 0) return

    this.stats.starPowerActive = true
    this.stats.starPowerActivations += 1
    const songTimeSeconds = this.songTimeAt(performanceTime)
    this.starPowerFlash = {
      startedAt: songTimeSeconds,
      expiresAt: songTimeSeconds + 0.68,
    }
    if (this.mixGain) {
      playStarPowerIgnition(this.audioContext, this.mixGain)
    }
    this.lastStarPowerTick = secondsToTick(
      scoringTime,
      this.chart.tempos,
      this.chart.metadata.resolution,
      this.chart.metadata.offsetSeconds,
    )
    this.pushStats()
  }

  private updateStarPower(scoringTime: number): void {
    if (scoringTime < 0) {
      this.lastStarPowerTick = null
      return
    }

    const currentTick = secondsToTick(
      scoringTime,
      this.chart.tempos,
      this.chart.metadata.resolution,
      this.chart.metadata.offsetSeconds,
    )
    if (
      this.lastStarPowerTick === null ||
      currentTick < this.lastStarPowerTick
    ) {
      this.lastStarPowerTick = currentTick
      return
    }

    const previousMeter = this.stats.starPowerMeter
    const previouslyActive = this.stats.starPowerActive
    if (currentTick > this.lastStarPowerTick) {
      const tickDelta = currentTick - this.lastStarPowerTick
      this.stats.starPowerMeter = addWhammyStarPower(
        this.stats.starPowerMeter,
        tickDelta,
        this.chart.metadata.resolution,
        this.whammyStarPowerSustainActive(scoringTime),
      )
    }

    if (
      this.stats.starPowerActive &&
      currentTick > this.lastStarPowerTick
    ) {
      this.stats.starPowerMeter = drainStarPower(
        this.stats.starPowerMeter,
        currentTick - this.lastStarPowerTick,
        this.chart.metadata.resolution,
      )
      if (this.stats.starPowerMeter <= 0) {
        this.stats.starPowerActive = false
      }
    }

    if (
      this.stats.starPowerMeter !== previousMeter ||
      this.stats.starPowerActive !== previouslyActive
    ) {
      this.statsDirty = true
    }
    this.lastStarPowerTick = currentTick
  }

  private completeStarPowerPhrases(
    noteIndex: number,
    songTimeSeconds: number,
  ): void {
    const phraseIndices =
      this.chart.notes[noteIndex].starPowerPhraseIndices ?? []
    let phraseEarned = false
    for (const phraseIndex of phraseIndices) {
      if (this.starPowerPhraseStates[phraseIndex] !== 'pending') continue
      const phraseNotes =
        this.starPowerPhraseNoteIndices[phraseIndex] ?? []
      if (
        phraseNotes.length === 0 ||
        phraseNotes[phraseNotes.length - 1] !== noteIndex ||
        phraseNotes.some((index) => this.noteStates[index] !== 'hit')
      ) {
        continue
      }

      this.starPowerPhraseStates[phraseIndex] = 'earned'
      this.stats.starPowerMeter = addStarPowerPhrase(
        this.stats.starPowerMeter,
      )
      this.stats.starPowerPhrasesHit += 1
      phraseEarned = true
    }

    if (phraseEarned) {
      const note = this.chart.notes[noteIndex]
      this.starPowerPhraseFlash = {
        lanes: [...note.lanes],
        open: note.open,
        startedAt: songTimeSeconds,
        expiresAt: songTimeSeconds + 0.42,
      }
    }
  }

  private failStarPowerPhrases(noteIndex: number): void {
    const phraseIndices =
      this.chart.notes[noteIndex].starPowerPhraseIndices ?? []
    for (const phraseIndex of phraseIndices) {
      if (this.starPowerPhraseStates[phraseIndex] !== 'pending') continue
      this.starPowerPhraseStates[phraseIndex] = 'failed'
      this.stats.starPowerPhrasesMissed += 1
    }
  }

  private strum(performanceTime: number): void {
    if (this.attemptHit(performanceTime, 'strum')) return
    this.recordOverstrum(performanceTime)
  }

  private recordOverstrum(performanceTime: number): void {
    if (this.stopped || this.finished || this.paused) return
    if (this.songTimeAt(performanceTime) < 0) return

    this.stats.overstrums += 1
    this.stats.streak = 0
    this.lastHitNoteIndex = null
    this.bufferedHopoNoteIndex = null
    this.pushStats()
  }

  private fretChange(performanceTime: number): void {
    if (this.calibrationMode) return
    this.bufferedHopoNoteIndex = null
    if (this.attemptHit(performanceTime, 'fret')) return

    const candidateIndex = frontendHopoCandidate({
      notes: this.chart.notes,
      noteStates: this.noteStates,
      startIndex: this.missCursor,
      lastHitNoteIndex: this.lastHitNoteIndex,
      heldLanes: this.heldLanes(),
      activeSustainLanes: this.activeSustainLanes(),
    })
    this.bufferedHopoNoteIndex =
      candidateIndex >= 0 ? candidateIndex : null
  }

  private attemptBufferedHopo(
    rawSongTime: number,
    scoringTime: number,
  ): void {
    const noteIndex = this.bufferedHopoNoteIndex
    if (noteIndex === null) return

    const note = this.chart.notes[noteIndex]
    const previousNoteHit =
      noteIndex > 0 &&
      this.lastHitNoteIndex === noteIndex - 1 &&
      this.noteStates[noteIndex - 1] === 'hit'
    const stillEligible =
      this.noteStates[noteIndex] === 'pending' &&
      canFretHit(note, previousNoteHit) &&
      lanesMatchWithActiveSustains(
        note,
        this.heldLanes(),
        this.activeSustainLanes(),
      )

    if (!stillEligible) {
      this.bufferedHopoNoteIndex = null
      return
    }

    const windowSeconds = HIT_WINDOW_MS / 1000
    if (scoringTime < note.timeSeconds - windowSeconds) return
    if (scoringTime > note.timeSeconds + windowSeconds) {
      this.bufferedHopoNoteIndex = null
      return
    }

    this.bufferedHopoNoteIndex = null
    this.completeHit(noteIndex, rawSongTime, scoringTime)
  }

  private isPartialTapChordAt(performanceTime: number): boolean {
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
      const distance = Math.abs(scoringTime - note.timeSeconds)
      if (distance <= windowSeconds && distance < candidateDistance) {
        candidateIndex = index
        candidateDistance = distance
      }
    }

    if (candidateIndex < 0) return false
    return isPartialHandiTapChord(
      this.chart.notes[candidateIndex],
      this.heldLanes(),
      this.activeSustainLanes(),
    )
  }

  private attemptHit(
    performanceTime: number,
    inputType:
      | 'strum'
      | 'fret'
      | 'tap'
      | 'tap-slide'
      | 'tap-open-release'
      | 'calibration',
    heldLanesOverride?: Lane[],
  ): boolean {
    if (this.stopped || this.finished || this.paused) return false
    const rawSongTime = this.songTimeAt(performanceTime)
    if (rawSongTime < 0) return false
    const scoringTime =
      rawSongTime - this.calibration.inputOffsetMs / 1000
    const windowSeconds = HIT_WINDOW_MS / 1000

    const heldLanes = heldLanesOverride ?? this.heldLanes()
    const activeSustainLanes = this.activeSustainLanes()
    const candidateIndex = closestHitCandidate({
      notes: this.chart.notes,
      noteStates: this.noteStates,
      startIndex: this.missCursor,
      scoringTime,
      windowSeconds,
      isEligible: (note, index) => {
        if (
          inputType === 'fret' &&
          !canFretHit(
            note,
            index > 0 &&
              this.lastHitNoteIndex === index - 1 &&
              this.noteStates[index - 1] === 'hit',
          )
        ) {
          return false
        }
        if (
          inputType === 'tap-slide' &&
          !note.tap &&
          !note.hopo
        ) {
          return false
        }
        if (inputType === 'tap-open-release' && !note.open) return false
        return (
          this.calibrationMode ||
          lanesMatchWithActiveSustains(
            note,
            heldLanes,
            activeSustainLanes,
          )
        )
      },
    })

    if (candidateIndex === -1) {
      return false
    }

    return this.completeHit(
      candidateIndex,
      rawSongTime,
      scoringTime,
      heldLanesOverride,
    )
  }

  private completeHit(
    candidateIndex: number,
    rawSongTime: number,
    scoringTime: number,
    heldLanesOverride?: Lane[],
  ): boolean {
    const note = this.chart.notes[candidateIndex]
    const heldLanes = heldLanesOverride ?? this.heldLanes()
    const activeSustainLanes = this.activeSustainLanes()

    if (
      !this.calibrationMode &&
      !lanesMatchWithActiveSustains(
        note,
        heldLanes,
        activeSustainLanes,
      )
    ) {
      return false
    }

    this.bufferedHopoNoteIndex = null
    const errorMs = (scoringTime - note.timeSeconds) * 1000
    this.noteStates[candidateIndex] = 'hit'
    if (note.sustainTicks > 0 && note.sustainSeconds > 0.03) {
      this.sustainStates[candidateIndex] = 'holding'
      this.activeSustains.add(candidateIndex)
    }
    this.stats.score += scoreForHit(
      Math.max(1, note.lanes.length),
      this.stats.streak,
      this.stats.starPowerActive,
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
    this.recordsDirty = true
    this.completeStarPowerPhrases(candidateIndex, rawSongTime)
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

  private attemptBufferedTapSweep(
    rawSongTime: number,
    scoringTime: number,
  ): void {
    if (this.inputMode !== 'tap' || scoringTime < 0) return
    const windowSeconds = HIT_WINDOW_MS / 1000

    for (
      let noteIndex = this.missCursor;
      noteIndex < this.chart.notes.length;
      noteIndex += 1
    ) {
      if (this.noteStates[noteIndex] !== 'pending') continue
      const note = this.chart.notes[noteIndex]
      if (note.timeSeconds > scoringTime + windowSeconds) break
      if (note.timeSeconds < scoringTime - windowSeconds) continue
      if (
        note.open ||
        note.lanes.length !== 1 ||
        (!note.hopo && !note.tap)
      ) {
        return
      }

      const lane = note.lanes[0]
      if (!this.tapSweepBuffer.has(lane, scoringTime)) return
      if (
        this.completeHit(noteIndex, rawSongTime, scoringTime, [lane])
      ) {
        this.tapSweepBuffer.consume(lane, scoringTime)
      }
      return
    }
  }

  private updateSustains(scoringTime: number): void {
    if (this.activeSustains.size === 0) return

    const heldLanes = this.heldLanes()
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
        } else if (
          this.inputMode === 'tap'
            ? handiTapSustainReleaseExpired(
                mismatchStartedAt,
                scoringTime,
              )
            : sustainReleaseExpired(mismatchStartedAt, scoringTime)
        ) {
          this.sustainStates[noteIndex] = 'released'
          this.stats.sustainsBroken += 1
          this.statsDirty = true
          this.activeSustains.delete(noteIndex)
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
          unawardedBasePoints *
          scoreMultiplier(
            this.stats.streak,
            this.stats.starPowerActive,
          )
        this.sustainBasePointsAwarded[noteIndex] = targetBasePoints
        this.stats.score += awardedPoints
        this.stats.sustainPoints += awardedPoints
        this.statsDirty = true
      }

      if (sustainFinished) {
        this.sustainStates[noteIndex] = 'complete'
        this.stats.sustainsCompleted += 1
        this.statsDirty = true
        this.activeSustains.delete(noteIndex)
      }
    }
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
        const missedNote = this.chart.notes[this.missCursor]
        this.noteStates[this.missCursor] = 'miss'
        this.failStarPowerPhrases(this.missCursor)
        this.stats.misses += 1
        this.stats.streak = 0
        this.lastHitNoteIndex = null
        this.stats.records.push({
          noteIndex: this.missCursor,
          errorMs: HIT_WINDOW_MS,
          result: 'miss',
        })
        this.recordsDirty = true
        this.missFlash = {
          lanes: [...missedNote.lanes],
          open: missedNote.open,
          startedAt: scoringTime,
          expiresAt: scoringTime + 0.18,
        }
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

  private pushStats(now = performance.now()): void {
    this.lastStatsPush = now
    this.statsDirty = false
    this.onStats(this.snapshotStats())
  }

  private snapshotStats(): SessionStats {
    if (this.recordsDirty) {
      this.recordsSnapshot = [...this.stats.records]
      this.recordsDirty = false
    }
    return { ...this.stats, records: this.recordsSnapshot }
  }

  private readonly tick = (now: number): void => {
    if (this.stopped) return
    const songTimeSeconds = this.songTimeAt(now)
    const scoringTime =
      songTimeSeconds - this.calibration.inputOffsetMs / 1000

    if (this.inputMode === 'standard') {
      this.readGamepad(now)
    }
    this.updateStarPower(scoringTime)
    this.attemptBufferedHopo(songTimeSeconds, scoringTime)
    this.attemptBufferedTapSweep(songTimeSeconds, scoringTime)
    this.updateSustains(scoringTime)
    this.updateWhammyAudio(scoringTime)
    this.markMisses(scoringTime)
    if (this.hitFlash && this.hitFlash.expiresAt < songTimeSeconds) {
      this.hitFlash = null
    }
    if (this.missFlash && this.missFlash.expiresAt < scoringTime) {
      this.missFlash = null
    }
    if (
      this.starPowerFlash &&
      this.starPowerFlash.expiresAt < songTimeSeconds
    ) {
      this.starPowerFlash = null
    }
    if (
      this.starPowerPhraseFlash &&
      this.starPowerPhraseFlash.expiresAt < songTimeSeconds
    ) {
      this.starPowerPhraseFlash = null
    }

    if (this.statsDirty && now - this.lastStatsPush > 100) {
      this.pushStats(now)
    }

    this.onFrame({
      songTimeSeconds,
      visualTimeSeconds:
        (songTimeSeconds < 0
          ? this.practiceStartSeconds + songTimeSeconds
          : songTimeSeconds) +
        this.calibration.videoOffsetMs / 1000,
      heldLanes: this.heldLanes(),
      noteStates: this.noteStates,
      sustainStates: this.sustainStates,
      starPowerPhraseStates: this.starPowerPhraseStates,
      activeSustainIndices: [...this.activeSustains],
      stats: this.stats,
      whammyAmount: this.whammyAmount(),
      hitFlash: this.hitFlash,
      missFlash: this.missFlash,
      starPowerFlash: this.starPowerFlash,
      starPowerPhraseFlash: this.starPowerPhraseFlash,
    })

    const sectionRun = Number.isFinite(this.practiceEndSeconds)
    const runEndSeconds = sectionRun
      ? this.practiceEndSeconds
      : this.endTimeSeconds + 0.35
    if (songTimeSeconds >= runEndSeconds) {
      if (this.practiceLoop) {
        this.restart()
        return
      }
      this.finished = true
      const finalStats = this.snapshotStats()
      this.stop()
      this.onFinish(finalStats)
      return
    }

    this.frameRequest = requestAnimationFrame(this.tick)
  }
}
