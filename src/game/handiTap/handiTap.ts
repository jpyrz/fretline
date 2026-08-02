import type { ChartNote, Lane, ParsedChart } from '../../types/game'

export const HANDITAP_VERSION = 2

// Only bursts beyond roughly 14 notes per second are thinned. Ordinary authored
// rhythms, including 16th notes at common tempos, pass through unchanged.
const MIN_NOTE_INTERVAL_SECONDS = 0.07
const RAPID_REPEATED_CHORD_SECONDS = 0.115
const RAPID_TREMOLO_SECONDS = 0.125

function chordLanes(lanes: Lane[]): Lane[] {
  if (lanes.length <= 2) return lanes
  return [lanes[0], lanes[lanes.length - 1]]
}

function adaptNote(note: ChartNote): ChartNote {
  const lanes = chordLanes(note.lanes)
  return lanes === note.lanes ? note : { ...note, lanes }
}

function isStrongBeat(note: ChartNote, resolution: number): boolean {
  if (resolution <= 0) return false
  const halfBeat = Math.max(1, Math.round(resolution / 2))
  return note.tick % halfBeat === 0
}

function densityPriority(note: ChartNote, resolution: number): number {
  let priority = 0
  if (note.starPower || (note.starPowerPhraseIndices?.length ?? 0) > 0) {
    priority += 8
  }
  if (note.sustainSeconds > 0.03 || note.sustainTicks > 0) priority += 4
  if (note.lanes.length === 2) priority += 2
  if (isStrongBeat(note, resolution)) priority += 1
  return priority
}

function hasStarPowerMembership(note: ChartNote): boolean {
  return note.starPower || (note.starPowerPhraseIndices?.length ?? 0) > 0
}

function sameLanes(left: ChartNote, right: ChartNote): boolean {
  return (
    left.open === right.open &&
    left.lanes.length === right.lanes.length &&
    left.lanes.every((lane, index) => lane === right.lanes[index])
  )
}

function repeatedHoldThreshold(note: ChartNote): number | null {
  if (note.open) return null
  if (note.lanes.length === 2) return RAPID_REPEATED_CHORD_SECONDS
  if (note.lanes.length === 1) return RAPID_TREMOLO_SECONDS
  return null
}

function mergeRapidRepeatedHolds(notes: ChartNote[]): ChartNote[] {
  const playable: ChartNote[] = []

  for (let index = 0; index < notes.length; ) {
    const first = notes[index]
    const threshold = repeatedHoldThreshold(first)
    if (threshold === null || hasStarPowerMembership(first)) {
      playable.push(first)
      index += 1
      continue
    }

    let runEnd = index
    while (runEnd + 1 < notes.length) {
      const current = notes[runEnd]
      const next = notes[runEnd + 1]
      const gap =
        next.timeSeconds -
        (current.timeSeconds + current.sustainSeconds)
      if (
        !sameLanes(first, next) ||
        hasStarPowerMembership(next) ||
        gap > threshold + 0.000001
      ) {
        break
      }
      runEnd += 1
    }

    const runLength = runEnd - index + 1
    const minimumRunLength = first.lanes.length === 1 ? 3 : 2
    if (runLength < minimumRunLength) {
      playable.push(...notes.slice(index, runEnd + 1))
      index = runEnd + 1
      continue
    }

    const last = notes[runEnd]
    const sustainTicks = Math.max(
      first.sustainTicks,
      last.tick + last.sustainTicks - first.tick,
    )
    const sustainSeconds = Math.max(
      first.sustainSeconds,
      last.timeSeconds + last.sustainSeconds - first.timeSeconds,
    )
    playable.push({
      ...first,
      sustainTicks,
      sustainSeconds,
    })
    index = runEnd + 1
  }

  return playable
}

function reduceExtremeDensity(
  notes: ChartNote[],
  resolution: number,
): ChartNote[] {
  const playable: ChartNote[] = []

  for (const note of notes) {
    const previous = playable[playable.length - 1]
    if (
      !previous ||
      note.timeSeconds - previous.timeSeconds >= MIN_NOTE_INTERVAL_SECONDS
    ) {
      playable.push(note)
      continue
    }

    if (
      densityPriority(note, resolution) >
      densityPriority(previous, resolution)
    ) {
      playable[playable.length - 1] = note
    }
  }

  return playable
}

/**
 * Creates the single playable Tap Mode representation of a chart. The source
 * chart and its notes remain untouched; this derived chart is discarded or
 * cached independently of the imported Clone Hero data.
 */
export function adaptChartForHandiTap(chart: ParsedChart): ParsedChart {
  const adaptedNotes = chart.notes.map(adaptNote)
  const heldRepeatedNotes = mergeRapidRepeatedHolds(adaptedNotes)
  const playableNotes = reduceExtremeDensity(
    heldRepeatedNotes,
    chart.metadata.resolution,
  )

  return {
    ...chart,
    notes: playableNotes,
  }
}
