import type { LocalSong, ParsedChart } from '../types/game'

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface PlayPreferences {
  difficulty: Difficulty
  instrumentId: string
}

export interface TrackChoice {
  chart: ParsedChart
  difficulty: Difficulty
  instrumentId: string
  instrumentLabel: string
}

export interface InstrumentChoice {
  id: string
  label: string
  tracks: TrackChoice[]
}

const INSTRUMENT_LABELS = new Map<string, string>([
  ['Single', 'Lead Guitar'],
  ['DoubleBass', 'Bass'],
  ['DoubleRhythm', 'Rhythm Guitar'],
  ['DoubleGuitar', 'Co-op Guitar'],
  ['Keyboard', 'Keys'],
])

const INSTRUMENT_ORDER = [
  'Single',
  'DoubleBass',
  'DoubleRhythm',
  'DoubleGuitar',
  'Keyboard',
]

function humanizeInstrument(instrumentId: string): string {
  return (
    INSTRUMENT_LABELS.get(instrumentId) ??
    (instrumentId
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^Double /, 'Co-op ')
      .trim() ||
      'Guitar')
  )
}

function parseTrackName(trackName: string): {
  difficulty: Difficulty
  instrumentId: string
  instrumentLabel: string
} | null {
  const difficulty = DIFFICULTIES.find((candidate) =>
    trackName.startsWith(candidate),
  )
  if (!difficulty) return null

  const instrumentId = trackName.slice(difficulty.length) || 'Single'
  return {
    difficulty,
    instrumentId,
    instrumentLabel: humanizeInstrument(instrumentId),
  }
}

export function parseTrackChoice(chart: ParsedChart): TrackChoice | null {
  const parsed = parseTrackName(chart.trackName)
  return parsed ? { chart, ...parsed } : null
}

export function instrumentChoices(song: LocalSong): InstrumentChoice[] {
  const instruments = new Map<string, InstrumentChoice>()

  for (const chart of song.charts) {
    const track = parseTrackChoice(chart)
    if (!track) continue
    const instrument = instruments.get(track.instrumentId) ?? {
      id: track.instrumentId,
      label: track.instrumentLabel,
      tracks: [],
    }
    instrument.tracks.push(track)
    instruments.set(track.instrumentId, instrument)
  }

  return [...instruments.values()]
    .map((instrument) => ({
      ...instrument,
      tracks: instrument.tracks.sort(
        (a, b) =>
          DIFFICULTIES.indexOf(a.difficulty) -
          DIFFICULTIES.indexOf(b.difficulty),
      ),
    }))
    .sort((a, b) => {
      const aIndex = INSTRUMENT_ORDER.indexOf(a.id)
      const bIndex = INSTRUMENT_ORDER.indexOf(b.id)
      return (
        (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex) ||
        a.label.localeCompare(b.label)
      )
    })
}

export function preferredInstrument(
  instruments: InstrumentChoice[],
  preferredId: string,
): InstrumentChoice | null {
  return (
    instruments.find((instrument) => instrument.id === preferredId) ??
    instruments.find((instrument) => instrument.id === 'Single') ??
    instruments[0] ??
    null
  )
}

export function preferredTrack(
  instrument: InstrumentChoice,
  difficulty: Difficulty,
): TrackChoice {
  const exact = instrument.tracks.find(
    (track) => track.difficulty === difficulty,
  )
  if (exact) return exact

  const preferredIndex = DIFFICULTIES.indexOf(difficulty)
  return [...instrument.tracks].sort((a, b) => {
    const aIndex = DIFFICULTIES.indexOf(a.difficulty)
    const bIndex = DIFFICULTIES.indexOf(b.difficulty)
    return (
      Math.abs(aIndex - preferredIndex) -
        Math.abs(bIndex - preferredIndex) ||
      bIndex - aIndex
    )
  })[0]
}

export function trackLabel(trackName: string): string {
  const parsed = parseTrackName(trackName)
  return parsed
    ? `${parsed.difficulty} · ${parsed.instrumentLabel}`
    : trackName
}
