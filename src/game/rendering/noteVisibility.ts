import type {
  ChartNote,
  GameFrame,
  ParsedChart,
  SustainState,
} from '../../types/game'
import { projectHighwayProgress } from './highwayGeometry'

export interface NoteRenderState {
  state: GameFrame['noteStates'][number]
  sustainState: SustainState
  activeSustain: boolean
  progress: number
  depthAlpha: number
}

export function noteRenderState(
  note: ChartNote,
  noteIndex: number,
  frame: GameFrame,
  travelSeconds: number,
): NoteRenderState | null {
  const state = frame.noteStates[noteIndex]
  const sustainState = frame.sustainStates[noteIndex]
  const sustainEnd = note.timeSeconds + note.sustainSeconds
  const activeSustain =
    state === 'hit' &&
    note.sustainSeconds > 0.03 &&
    sustainState !== 'none' &&
    sustainEnd > frame.visualTimeSeconds
  if (state === 'hit' && !activeSustain) return null

  const secondsUntil = note.timeSeconds - frame.visualTimeSeconds
  if (!activeSustain && (secondsUntil > travelSeconds || secondsUntil < -0.2)) {
    return null
  }

  const progress = activeSustain ? 1 : 1 - secondsUntil / travelSeconds
  if (progress < 0 || progress > 1.16) return null

  const visibleProgress = Math.max(0, Math.min(1, progress))
  const missedFade = 1 - Math.min(1, Math.max(0, progress - 1) / 0.055)
  const sustainHeld = activeSustain && sustainState !== 'released'
  const projectedProgress = projectHighwayProgress(visibleProgress)
  const depthAlpha =
    state === 'miss'
      ? 0.34 * missedFade
      : activeSustain
        ? sustainHeld
          ? 1
          : 0.45
        : 0.38 + projectedProgress * 0.62

  return {
    state,
    sustainState,
    activeSustain,
    progress,
    depthAlpha,
  }
}

function lowerBoundNoteTime(
  notes: ChartNote[],
  timeSeconds: number,
): number {
  let low = 0
  let high = notes.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (notes[middle].timeSeconds < timeSeconds) low = middle + 1
    else high = middle
  }
  return low
}

export function visibleNoteIndices(
  chart: ParsedChart,
  frame: GameFrame,
  travelSeconds: number,
): number[] {
  const start = lowerBoundNoteTime(
    chart.notes,
    frame.visualTimeSeconds - 0.21,
  )
  const end = lowerBoundNoteTime(
    chart.notes,
    frame.visualTimeSeconds + travelSeconds + 0.001,
  )
  const indices = Array.from(
    { length: Math.max(0, end - start) },
    (_, offset) => start + offset,
  )
  const included = new Set(indices)
  for (const noteIndex of frame.activeSustainIndices ?? []) {
    if (included.has(noteIndex)) continue
    indices.push(noteIndex)
  }
  return indices.sort((a, b) => a - b)
}
