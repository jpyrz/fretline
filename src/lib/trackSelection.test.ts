import { describe, expect, it } from 'vitest'
import {
  instrumentChoices,
  parseTrackChoice,
  preferredInstrument,
  preferredTrack,
} from './trackSelection'
import type { LocalSong, ParsedChart } from '../types/game'

function chart(trackName: string): ParsedChart {
  return {
    metadata: {
      name: 'Test',
      artist: 'Test',
      charter: 'Test',
      resolution: 192,
      offsetSeconds: 0,
    },
    notes: [],
    tempos: [],
    trackName,
    availableTracks: [],
    durationSeconds: 1,
  }
}

function song(trackNames: string[]): LocalSong {
  const charts = trackNames.map(chart)
  return {
    id: 'test',
    kind: 'folder',
    chart: charts[0],
    charts,
    audioFiles: [],
  }
}

describe('track selection', () => {
  it('splits Clone Hero track names into difficulty and instrument', () => {
    expect(parseTrackChoice(chart('ExpertSingle'))).toMatchObject({
      difficulty: 'Expert',
      instrumentId: 'Single',
      instrumentLabel: 'Lead Guitar',
    })
    expect(parseTrackChoice(chart('HardDoubleBass'))).toMatchObject({
      difficulty: 'Hard',
      instrumentId: 'DoubleBass',
      instrumentLabel: 'Bass',
    })
  })

  it('groups tracks by instrument in a stable player-facing order', () => {
    const choices = instrumentChoices(
      song(['ExpertDoubleBass', 'HardSingle', 'ExpertSingle']),
    )

    expect(choices.map((choice) => choice.label)).toEqual([
      'Lead Guitar',
      'Bass',
    ])
    expect(choices[0].tracks.map((track) => track.difficulty)).toEqual([
      'Hard',
      'Expert',
    ])
  })

  it('keeps the preferred difficulty without overwriting it for sparse songs', () => {
    const instruments = instrumentChoices(
      song(['EasySingle', 'HardSingle']),
    )
    const instrument = preferredInstrument(instruments, 'Single')

    expect(instrument).not.toBeNull()
    expect(preferredTrack(instrument!, 'Expert').difficulty).toBe('Hard')
  })
})
