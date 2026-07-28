export type Lane = 0 | 1 | 2 | 3 | 4

export interface TempoEvent {
  tick: number
  bpm: number
  timeSeconds: number
}

export interface ChartNote {
  tick: number
  timeSeconds: number
  lanes: Lane[]
  open: boolean
  sustainTicks: number
  sustainSeconds: number
  hopo: boolean
  forced: boolean
  tap: boolean
}

export interface ChartMetadata {
  name: string
  artist: string
  charter: string
  resolution: number
  offsetSeconds: number
}

export interface ParsedChart {
  metadata: ChartMetadata
  notes: ChartNote[]
  tempos: TempoEvent[]
  trackName: string
  availableTracks: string[]
  durationSeconds: number
}

export interface LocalSong {
  id: string
  kind: 'calibration' | 'folder'
  chart: ParsedChart
  charts: ParsedChart[]
  audioFiles: File[]
  folderName?: string
}

export type GamepadBinding =
  | { type: 'button'; index: number }
  | { type: 'axis'; index: number; direction: -1 | 1; rest?: number }

export interface ControllerMapping {
  gamepadId: string
  gamepadIndex: number
  frets: [
    GamepadBinding,
    GamepadBinding,
    GamepadBinding,
    GamepadBinding,
    GamepadBinding,
  ]
  strumUp: GamepadBinding
  strumDown: GamepadBinding
}

export interface CalibrationSettings {
  inputOffsetMs: number
  videoOffsetMs: number
}

export interface HighwaySettings {
  noteSpeed: number
}

export interface HitRecord {
  noteIndex: number
  errorMs: number
  result: 'hit' | 'miss'
}

export interface SessionStats {
  score: number
  sustainPoints: number
  streak: number
  bestStreak: number
  hits: number
  misses: number
  overstrums: number
  sustainsCompleted: number
  sustainsBroken: number
  lastErrorMs: number | null
  records: HitRecord[]
}

export type SustainState = 'none' | 'holding' | 'released' | 'complete'

export interface GameFrame {
  songTimeSeconds: number
  visualTimeSeconds: number
  heldLanes: Lane[]
  noteStates: Array<'pending' | 'hit' | 'miss'>
  sustainStates: SustainState[]
  stats: SessionStats
  hitFlash: {
    lanes: Lane[]
    open: boolean
    startedAt: number
    expiresAt: number
  } | null
}
