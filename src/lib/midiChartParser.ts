import { parseMidi, type MidiEvent } from 'midi-file'
import {
  createTempoEvents,
  groupNotes,
  type RawNote,
} from './chartParser'
import type {
  ChartMetadata,
  ParsedChart,
  TempoEvent,
} from '../types/game'
import type { SongIniMetadata } from './songIni'

const DIFFICULTIES = [
  { name: 'Easy', baseNote: 60 },
  { name: 'Medium', baseNote: 72 },
  { name: 'Hard', baseNote: 84 },
  { name: 'Expert', baseNote: 96 },
] as const

const INSTRUMENTS = new Map([
  ['PART GUITAR', 'Single'],
  ['T1 GEMS', 'Single'],
  ['PART GUITAR COOP', 'DoubleGuitar'],
  ['PART BASS', 'DoubleBass'],
  ['PART RHYTHM', 'DoubleRhythm'],
])

const TRACK_PREFERENCE = [
  'ExpertSingle',
  'HardSingle',
  'MediumSingle',
  'EasySingle',
]

interface TimedMidiEvent {
  tick: number
  event: MidiEvent
}

interface MidiTrack {
  name: string
  events: TimedMidiEvent[]
}

function timeTrack(events: MidiEvent[]): TimedMidiEvent[] {
  let tick = 0
  return events.map((event) => {
    tick += event.deltaTime
    return { tick, event }
  })
}

function getTrackName(events: TimedMidiEvent[]): string {
  const event = events.find(
    (entry) => entry.event.type === 'trackName',
  )?.event
  return event?.type === 'trackName' ? event.text.trim().toUpperCase() : ''
}

function readMidiTempos(
  tracks: MidiTrack[],
  resolution: number,
): TempoEvent[] {
  const tempos = tracks.flatMap(({ events }) =>
    events.flatMap(({ tick, event }) =>
      event.type === 'setTempo'
        ? [
            {
              tick,
              bpm: 60_000_000 / event.microsecondsPerBeat,
            },
          ]
        : [],
    ),
  )
  if (tempos.length === 0) tempos.push({ tick: 0, bpm: 120 })
  return createTempoEvents(tempos, resolution)
}

function readDifficultyNotes(
  track: MidiTrack,
  baseNote: number,
): RawNote[] {
  const active = new Map<number, number[]>()
  const rawNotes: RawNote[] = []

  for (const { tick, event } of track.events) {
    if (event.type !== 'noteOn' && event.type !== 'noteOff') continue
    const noteNumber = event.noteNumber
    const isNoteOn = event.type === 'noteOn' && event.velocity > 0
    const lane =
      noteNumber >= baseNote && noteNumber <= baseNote + 4
        ? noteNumber - baseNote
        : noteNumber === baseNote - 1
          ? 7
          : noteNumber === baseNote + 5
            ? 5
            : noteNumber === baseNote + 6
              ? 6
              : null
    if (lane === null) continue

    if (isNoteOn) {
      const starts = active.get(noteNumber) ?? []
      starts.push(tick)
      active.set(noteNumber, starts)
      continue
    }

    const starts = active.get(noteNumber)
    const startTick = starts?.shift()
    if (startTick === undefined) continue
    rawNotes.push({
      tick: startTick,
      lane,
      sustainTicks: Math.max(0, tick - startTick),
    })
  }

  return rawNotes.sort((a, b) => a.tick - b.tick || a.lane - b.lane)
}

export function parseMidiCharts(
  source: ArrayBuffer | Uint8Array,
  iniMetadata?: SongIniMetadata,
): ParsedChart[] {
  const midi = parseMidi(
    source instanceof Uint8Array ? source : new Uint8Array(source),
  )
  const resolution = midi.header.ticksPerBeat
  if (!resolution) {
    throw new Error('SMPTE-timed MIDI charts are not supported.')
  }

  const tracks = midi.tracks.map((events) => {
    const timedEvents = timeTrack(events)
    return { name: getTrackName(timedEvents), events: timedEvents }
  })
  const tempos = readMidiTempos(tracks, resolution)
  const metadata: ChartMetadata = {
    name: iniMetadata?.name || 'Untitled chart',
    artist: iniMetadata?.artist || 'Unknown artist',
    charter: iniMetadata?.charter || 'Unknown charter',
    resolution,
    offsetSeconds: iniMetadata?.offsetSeconds ?? 0,
  }

  const trackNotes = new Map<string, RawNote[]>()
  for (const midiTrack of tracks) {
    const instrument = INSTRUMENTS.get(midiTrack.name)
    if (!instrument) continue
    for (const difficulty of DIFFICULTIES) {
      const notes = readDifficultyNotes(midiTrack, difficulty.baseNote)
      if (notes.some((note) => note.lane <= 4 || note.lane === 7)) {
        trackNotes.set(`${difficulty.name}${instrument}`, notes)
      }
    }
  }

  const availableTracks = [...trackNotes.keys()]
  if (availableTracks.length === 0) {
    throw new Error('No supported five-fret guitar track was found in notes.mid.')
  }
  availableTracks.sort((a, b) => {
    const preferredA = TRACK_PREFERENCE.indexOf(a)
    const preferredB = TRACK_PREFERENCE.indexOf(b)
    if (preferredA >= 0 || preferredB >= 0) {
      return (
        (preferredA < 0 ? Number.MAX_SAFE_INTEGER : preferredA) -
        (preferredB < 0 ? Number.MAX_SAFE_INTEGER : preferredB)
      )
    }
    return a.localeCompare(b)
  })

  return availableTracks.map((trackName) => {
    const notes = groupNotes(trackNotes.get(trackName) ?? [], metadata, tempos)
    const last = notes[notes.length - 1]
    return {
      metadata,
      notes,
      tempos,
      trackName,
      availableTracks,
      durationSeconds: last.timeSeconds + last.sustainSeconds + 1.5,
    }
  })
}
