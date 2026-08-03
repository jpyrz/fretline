import type {
  ChartNote,
  HandiTapBurstMarker,
  Lane,
  ParsedChart,
} from '../../types/game'

export const HANDITAP_VERSION = 5

// Only bursts beyond roughly 14 notes per second are thinned. Ordinary authored
// rhythms, including 16th notes at common tempos, pass through unchanged.
const MIN_NOTE_INTERVAL_SECONDS = 0.07
// Repeated chords and single-note tremolo use the same attack-rate cutoff.
// Authored sustain tails must not make an otherwise playable rhythm appear
// faster than it is.
const RAPID_REPEATED_HOLD_SECONDS = 0.1
const RAPID_LEAD_INTERVAL_SECONDS = 0.18
const RAPID_LEAD_MIN_NOTES = 5

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

function sameStarPowerMembership(
  left: ChartNote,
  right: ChartNote,
): boolean {
  const leftPhrases = left.starPowerPhraseIndices ?? []
  const rightPhrases = right.starPowerPhraseIndices ?? []
  return (
    Boolean(left.starPower) === Boolean(right.starPower) &&
    leftPhrases.length === rightPhrases.length &&
    leftPhrases.every(
      (phraseIndex, index) => phraseIndex === rightPhrases[index],
    )
  )
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
  if (note.lanes.length === 1 || note.lanes.length === 2) {
    return RAPID_REPEATED_HOLD_SECONDS
  }
  return null
}

interface PendingBurstMarker {
  timeSeconds: number
  lane: Lane
  parentTimeSeconds: number
}

function mergeRapidRepeatedHolds(notes: ChartNote[]): {
  notes: ChartNote[]
  burstMarkers: PendingBurstMarker[]
} {
  const playable: ChartNote[] = []
  const burstMarkers: PendingBurstMarker[] = []

  for (let index = 0; index < notes.length; ) {
    const first = notes[index]
    const threshold = repeatedHoldThreshold(first)
    if (
      threshold === null ||
      (first.lanes.length !== 1 && hasStarPowerMembership(first))
    ) {
      playable.push(first)
      index += 1
      continue
    }

    let runEnd = index
    while (runEnd + 1 < notes.length) {
      const current = notes[runEnd]
      const next = notes[runEnd + 1]
      const attackInterval = next.timeSeconds - current.timeSeconds
      if (
        !sameLanes(first, next) ||
        !sameStarPowerMembership(first, next) ||
        attackInterval > threshold + 0.000001
      ) {
        break
      }
      runEnd += 1
    }

    const runLength = runEnd - index + 1
    const minimumRunLength = first.lanes.length === 1 ? 4 : 3
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
    if (first.lanes.length === 1) {
      for (const repeatedNote of notes.slice(index + 1, runEnd + 1)) {
        burstMarkers.push({
          timeSeconds: repeatedNote.timeSeconds,
          lane: first.lanes[0],
          parentTimeSeconds: first.timeSeconds,
        })
      }
    }
    index = runEnd + 1
  }

  return { notes: playable, burstMarkers }
}

function isLeadAnchor(note: ChartNote): boolean {
  return (
    !note.open &&
    note.lanes.length === 1 &&
    note.sustainSeconds <= 0.03 &&
    note.sustainTicks === 0
  )
}

function foldLeadRun(run: ChartNote[]): ChartNote[] {
  let previousSourceLane = run[0].lanes[0]
  let foldedLane = Math.max(
    1,
    Math.min(3, Math.round(1 + previousSourceLane / 2)),
  ) as Lane

  return run.map((note, index) => {
    const sourceLane = note.lanes[0]
    if (index > 0) {
      const direction = Math.sign(sourceLane - previousSourceLane)
      if (direction !== 0) {
        const candidate = foldedLane + direction
        foldedLane = (
          candidate < 1 || candidate > 3 ? 2 : candidate
        ) as Lane
      }
      previousSourceLane = sourceLane
    }
    return sourceLane === foldedLane ? note : { ...note, lanes: [foldedLane] }
  })
}

/**
 * Folds only continuous, full-fretboard lead bursts into the middle three
 * lanes. The rhythm and note count stay intact; slower riffs and runs that do
 * not span green through orange retain their authored lane pattern.
 */
function foldWideRapidLeads(notes: ChartNote[]): ChartNote[] {
  const playable: ChartNote[] = []

  for (let index = 0; index < notes.length; ) {
    const first = notes[index]
    if (!isLeadAnchor(first)) {
      playable.push(first)
      index += 1
      continue
    }

    let runEnd = index
    while (runEnd + 1 < notes.length) {
      const current = notes[runEnd]
      const next = notes[runEnd + 1]
      if (
        !isLeadAnchor(next) ||
        (!next.hopo && !next.tap) ||
        next.lanes[0] === current.lanes[0] ||
        next.timeSeconds - current.timeSeconds >
          RAPID_LEAD_INTERVAL_SECONDS + 0.000001
      ) {
        break
      }
      runEnd += 1
    }

    const run = notes.slice(index, runEnd + 1)
    const lanes = run.map((note) => note.lanes[0])
    const spansFullFretboard = Math.max(...lanes) - Math.min(...lanes) === 4
    playable.push(
      ...(run.length >= RAPID_LEAD_MIN_NOTES && spansFullFretboard
        ? foldLeadRun(run)
        : run),
    )
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
  const foldedRapidLeads = foldWideRapidLeads(heldRepeatedNotes.notes)
  const playableNotes = reduceExtremeDensity(
    foldedRapidLeads,
    chart.metadata.resolution,
  )
  const handiTapBurstMarkers = heldRepeatedNotes.burstMarkers.flatMap(
    (marker): HandiTapBurstMarker[] => {
      const parentNoteIndex = playableNotes.findIndex(
        (note) =>
          Math.abs(note.timeSeconds - marker.parentTimeSeconds) < 0.000001 &&
          note.lanes.length === 1 &&
          note.lanes[0] === marker.lane &&
          note.sustainSeconds > 0.03,
      )
      return parentNoteIndex < 0
        ? []
        : [
            {
              timeSeconds: marker.timeSeconds,
              lane: marker.lane,
              parentNoteIndex,
            },
          ]
    },
  )

  return {
    ...chart,
    notes: playableNotes,
    handiTapBurstMarkers,
  }
}
