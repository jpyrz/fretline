import type { ChartNote, Lane, ParsedChart } from '../../types/game'

export const HANDITAP_VERSION = 1

// Only bursts beyond roughly 14 notes per second are thinned. Ordinary authored
// rhythms, including 16th notes at common tempos, pass through unchanged.
const MIN_NOTE_INTERVAL_SECONDS = 0.07
const RAPID_REPEATED_CHORD_SECONDS = 0.115

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

function mergeRapidRepeatedChords(notes: ChartNote[]): ChartNote[] {
  const playable: ChartNote[] = []

  for (const note of notes) {
    const previous = playable[playable.length - 1]
    const isRapidRepeat =
      previous &&
      previous.lanes.length === 2 &&
      note.lanes.length === 2 &&
      sameLanes(previous, note) &&
      note.timeSeconds -
        (previous.timeSeconds + previous.sustainSeconds) <=
        RAPID_REPEATED_CHORD_SECONDS &&
      !hasStarPowerMembership(previous) &&
      !hasStarPowerMembership(note)

    if (!isRapidRepeat) {
      playable.push(note)
      continue
    }

    const sustainTicks = Math.max(
      previous.sustainTicks,
      note.tick + note.sustainTicks - previous.tick,
    )
    const sustainSeconds = Math.max(
      previous.sustainSeconds,
      note.timeSeconds + note.sustainSeconds - previous.timeSeconds,
    )
    playable[playable.length - 1] = {
      ...previous,
      sustainTicks,
      sustainSeconds,
    }
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
  const heldRepeatedChords = mergeRapidRepeatedChords(adaptedNotes)
  const playableNotes = reduceExtremeDensity(
    heldRepeatedChords,
    chart.metadata.resolution,
  )

  return {
    ...chart,
    notes: playableNotes,
  }
}
