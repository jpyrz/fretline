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
  starPower?: boolean
  starPowerPhraseIndices?: number[]
}

export interface StarPowerPhrase {
  tick: number
  tickLength: number
  timeSeconds: number
  endTimeSeconds: number
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
  starPowerPhrases?: StarPowerPhrase[]
}

export interface LocalSong {
  id: string
  kind: 'calibration' | 'folder'
  chart: ParsedChart
  charts: ParsedChart[]
  audioFiles: File[]
  previewAudioFile?: File
  previewStartSeconds?: number
  artworkFile?: File
  folderName?: string
  audioOffsetMs?: number
  persistedFiles?: {
    version: 2
    audio: PersistedFileReference[]
    preview?: PersistedFileReference
    artwork?: PersistedFileReference
  }
  legacyPersistedFiles?: boolean
  source?: {
    type: 'google-drive'
    rootFolderId?: string
    folderId?: string
    fileIds?: string[]
    fingerprint: string
  }
}

export interface PersistedFileReference {
  key: string
  name: string
  type: string
  size: number
  lastModified: number
}

export type GamepadBinding =
  | { type: 'button'; index: number }
  | {
      type: 'axis'
      index: number
      direction: -1 | 1
      rest?: number
      value?: number
    }

export interface HidBinding {
  type: 'hid'
  reportId: number
  byteIndex: number
  mask: number
  activeValue: number
}

export interface HidAnalogBinding {
  type: 'hid-axis'
  reportId: number
  byteIndex: number
  rest: number
  value: number
}

export interface HidDeviceIdentity {
  vendorId: number
  productId: number
  productName: string
}

type FiveFrets<T> = [T, T, T, T, T]

export interface GamepadControllerMapping {
  source?: 'gamepad'
  gamepadId: string
  gamepadIndex: number
  frets: FiveFrets<GamepadBinding>
  strumUp: GamepadBinding
  strumDown: GamepadBinding
  starPower?: GamepadBinding
  whammy?: GamepadBinding
  start?: GamepadBinding
}

export interface HidControllerMapping {
  source: 'hid'
  device: HidDeviceIdentity
  frets: FiveFrets<HidBinding>
  strumUp: HidBinding
  strumDown: HidBinding
  starPower?: HidBinding
  whammy?: HidAnalogBinding
  start?: HidBinding
}

export type ControllerMapping =
  | GamepadControllerMapping
  | HidControllerMapping

export interface KeyboardMapping {
  frets: FiveFrets<string>
  strumUp: string
  strumDown: string
  select: string
  back: string
  pause: string
  starPower: string
  whammy: string
}

export interface CalibrationSettings {
  modelVersion: 2
  audioOffsetMs: number
  inputOffsetMs: number
  videoOffsetMs: number
}

export interface HighwaySettings {
  noteSpeed: number
  length: number
  missFeedback: boolean
}

export interface AudioSettings {
  homeMusicMuted: boolean
}

export type VisualAssetKind = 'background' | 'highway'

export interface VisualAsset {
  id: string
  kind: VisualAssetKind
  name: string
  file: File
  source:
    | {
        type: 'local'
      }
    | {
        type: 'google-drive'
        fileId: string
        folderId: string
        fingerprint: string
      }
}

export interface VisualAssetFolder {
  id: string
  name: string
  scopeVersion: 2
}

export interface VisualSettings {
  backgroundSelection: 'default' | 'random' | string
  highwaySelection: 'default' | 'random' | string
  backgroundDim: number
  highwayOpacity: number
  backgroundDriveFolder: VisualAssetFolder | null
  highwayDriveFolder: VisualAssetFolder | null
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
  starPowerMeter: number
  starPowerActive: boolean
  starPowerPhrasesHit: number
  starPowerPhrasesMissed: number
  starPowerActivations: number
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
  activeSustainIndices?: number[]
  stats: SessionStats
  whammyAmount: number
  hitFlash: {
    lanes: Lane[]
    open: boolean
    startedAt: number
    expiresAt: number
  } | null
  missFlash?: {
    lanes: Lane[]
    open: boolean
    startedAt: number
    expiresAt: number
  } | null
}
