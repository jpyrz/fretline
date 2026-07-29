import type {
  ChartMetadata,
  ChartNote,
  Lane,
  ParsedChart,
  TempoEvent,
} from '../types/game'

const TRACK_PREFERENCE = [
  'ExpertSingle',
  'HardSingle',
  'MediumSingle',
  'EasySingle',
]

export interface RawNote {
  tick: number
  lane: number
  sustainTicks: number
  modifier?: 'flip' | 'forceHopo' | 'forceStrum' | 'tap'
}

interface ClassifiedChartNote extends ChartNote {
  flip: boolean
  forceHopo: boolean
  forceStrum: boolean
}

function cleanValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('“') && trimmed.endsWith('”'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readSections(source: string): Map<string, string> {
  const normalized = source.replace(/\r\n?/g, '\n')
  const sections = new Map<string, string>()
  const sectionPattern = /\[([^\]]+)]\s*\{([\s\S]*?)\}/g

  for (const match of normalized.matchAll(sectionPattern)) {
    sections.set(match[1].trim(), match[2])
  }

  return sections
}

function readMetadata(section: string | undefined): ChartMetadata {
  if (!section) {
    throw new Error('This file does not contain a [Song] section.')
  }

  const values = new Map<string, string>()
  for (const line of section.split('\n')) {
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/)
    if (match) values.set(match[1].trim().toLowerCase(), cleanValue(match[2]))
  }

  const resolution = Number(values.get('resolution'))
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('The chart is missing a valid Resolution value.')
  }

  const offset = Number(values.get('offset') ?? 0)

  return {
    name: values.get('name') || 'Untitled chart',
    artist: values.get('artist') || 'Unknown artist',
    charter: values.get('charter') || 'Unknown charter',
    resolution,
    offsetSeconds: Number.isFinite(offset) ? offset : 0,
  }
}

function readTempos(
  section: string | undefined,
  resolution: number,
): TempoEvent[] {
  if (!section) {
    throw new Error('This file does not contain a [SyncTrack] section.')
  }

  const raw = section
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s*=\s*B\s+(\d+)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      tick: Number(match[1]),
      bpm: Number(match[2]) / 1000,
    }))
    .filter((event) => event.bpm > 0)
    .sort((a, b) => a.tick - b.tick)

  return createTempoEvents(raw, resolution)
}

export function createTempoEvents(
  rawTempos: Array<{ tick: number; bpm: number }>,
  resolution: number,
): TempoEvent[] {
  const raw = [...rawTempos]
    .filter((event) => event.bpm > 0)
    .sort((a, b) => a.tick - b.tick)
  if (raw.length === 0) {
    throw new Error('The chart does not contain any BPM events.')
  }
  if (raw[0].tick !== 0) {
    raw.unshift({ tick: 0, bpm: raw[0].bpm })
  }

  const deduplicated = raw.filter(
    (event, index) =>
      index === raw.length - 1 || event.tick !== raw[index + 1].tick,
  )

  let elapsed = 0
  return deduplicated.map((event, index) => {
    if (index > 0) {
      const previous = deduplicated[index - 1]
      elapsed +=
        ((event.tick - previous.tick) / resolution) * (60 / previous.bpm)
    }
    return { ...event, timeSeconds: elapsed }
  })
}

export function tickToSeconds(
  tick: number,
  tempos: TempoEvent[],
  resolution: number,
  offsetSeconds = 0,
): number {
  let tempo = tempos[0]
  for (const candidate of tempos) {
    if (candidate.tick > tick) break
    tempo = candidate
  }

  return (
    offsetSeconds +
    tempo.timeSeconds +
    ((tick - tempo.tick) / resolution) * (60 / tempo.bpm)
  )
}

export function secondsToTick(
  timeSeconds: number,
  tempos: TempoEvent[],
  resolution: number,
  offsetSeconds = 0,
): number {
  const chartTimeSeconds = timeSeconds - offsetSeconds
  let tempo = tempos[0]

  for (const candidate of tempos) {
    if (candidate.timeSeconds > chartTimeSeconds) break
    tempo = candidate
  }

  return (
    tempo.tick +
    ((chartTimeSeconds - tempo.timeSeconds) / (60 / tempo.bpm)) *
      resolution
  )
}

function readNotes(section: string): RawNote[] {
  return section
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s*=\s*N\s+(\d+)\s+(\d+)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      tick: Number(match[1]),
      lane: Number(match[2]),
      sustainTicks: Number(match[3]),
    }))
    .sort((a, b) => a.tick - b.tick || a.lane - b.lane)
}

export function groupNotes(
  rawNotes: RawNote[],
  metadata: ChartMetadata,
  tempos: TempoEvent[],
  hopoThresholdTicks = Math.floor((65 / 192) * metadata.resolution),
): ChartNote[] {
  const byTick = new Map<number, RawNote[]>()
  for (const note of rawNotes) {
    const group = byTick.get(note.tick) ?? []
    group.push(note)
    byTick.set(note.tick, group)
  }

  const notes: ClassifiedChartNote[] = []
  for (const [tick, group] of [...byTick.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    const laneNotes = group.filter((note) => note.lane >= 0 && note.lane <= 4)
    const openNote = group.find((note) => note.lane === 7)
    if (laneNotes.length === 0 && !openNote) continue

    const longestSustain = Math.max(
      0,
      ...laneNotes.map((note) => note.sustainTicks),
      openNote?.sustainTicks ?? 0,
    )
    const timeSeconds = tickToSeconds(
      tick,
      tempos,
      metadata.resolution,
      metadata.offsetSeconds,
    )

    const flip = group.some(
      (note) =>
        note.modifier === 'flip' ||
        (note.modifier === undefined && note.lane === 5),
    )
    const forceHopo = group.some(
      (note) => note.modifier === 'forceHopo',
    )
    const forceStrum = group.some(
      (note) => note.modifier === 'forceStrum',
    )
    const tap = group.some(
      (note) =>
        note.modifier === 'tap' ||
        (note.modifier === undefined && note.lane === 6),
    )

    notes.push({
      tick,
      timeSeconds,
      lanes: laneNotes.map((note) => note.lane as Lane),
      open: Boolean(openNote),
      sustainTicks: longestSustain,
      sustainSeconds:
        tickToSeconds(
          tick + longestSustain,
          tempos,
          metadata.resolution,
          metadata.offsetSeconds,
        ) - timeSeconds,
      hopo: false,
      forced: flip || forceHopo || forceStrum,
      tap,
      forceHopo,
      forceStrum,
      flip,
    })
  }

  return notes.map((note, index) => {
    const previous = notes[index - 1]
    const naturalHopo =
      Boolean(previous) &&
      !note.open &&
      note.lanes.length === 1 &&
      !previous.open &&
      previous.lanes.length === 1 &&
      note.lanes[0] !== previous.lanes[0] &&
      note.tick - previous.tick <= hopoThresholdTicks

    const {
      forceHopo,
      forceStrum,
      flip,
      ...chartNote
    } = note
    const hopo = chartNote.tap
      ? true
      : forceStrum
        ? false
        : forceHopo
          ? true
          : flip
            ? !naturalHopo
            : naturalHopo

    return {
      ...chartNote,
      hopo,
    }
  })
}

export function parseChart(
  source: string,
  requestedTrack?: string,
): ParsedChart {
  const sections = readSections(source)
  const metadata = readMetadata(sections.get('Song'))
  const tempos = readTempos(sections.get('SyncTrack'), metadata.resolution)
  const availableTracks = [...sections.keys()].filter((name) =>
    /^(Easy|Medium|Hard|Expert)(Single|DoubleGuitar|DoubleBass|DoubleRhythm)$/.test(
      name,
    ),
  )

  const trackName =
    (requestedTrack && sections.has(requestedTrack) && requestedTrack) ||
    TRACK_PREFERENCE.find((track) => sections.has(track)) ||
    availableTracks[0]

  if (!trackName) {
    throw new Error('No supported five-fret guitar track was found.')
  }

  const notes = groupNotes(
    readNotes(sections.get(trackName) ?? ''),
    metadata,
    tempos,
  )

  if (notes.length === 0) {
    throw new Error(`[${trackName}] does not contain any playable notes.`)
  }

  const last = notes[notes.length - 1]
  return {
    metadata,
    notes,
    tempos,
    trackName,
    availableTracks,
    durationSeconds: last.timeSeconds + last.sustainSeconds + 1.5,
  }
}
