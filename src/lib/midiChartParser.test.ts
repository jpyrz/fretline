import { describe, expect, it } from 'vitest'
import { writeMidi, type MidiData } from 'midi-file'
import { parseMidiCharts } from './midiChartParser'
import { parseSongIni } from './songIni'

function makeMidi(): Uint8Array {
  const midi: MidiData = {
    header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
    tracks: [
      [
        {
          deltaTime: 0,
          meta: true,
          type: 'setTempo',
          microsecondsPerBeat: 500_000,
        },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
      [
        {
          deltaTime: 0,
          meta: true,
          type: 'trackName',
          text: 'PART GUITAR',
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 116,
          velocity: 100,
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 96,
          velocity: 100,
        },
        {
          deltaTime: 120,
          type: 'noteOff',
          channel: 0,
          noteNumber: 96,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 97,
          velocity: 100,
        },
        {
          deltaTime: 120,
          type: 'noteOff',
          channel: 0,
          noteNumber: 97,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: 'noteOff',
          channel: 0,
          noteNumber: 116,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 86,
          velocity: 100,
        },
        {
          deltaTime: 240,
          type: 'noteOff',
          channel: 0,
          noteNumber: 86,
          velocity: 0,
        },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
    ],
  }
  return new Uint8Array(writeMidi(midi))
}

function makeMidiWithModifiers(): Uint8Array {
  const midi: MidiData = {
    header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
    tracks: [
      [
        {
          deltaTime: 0,
          meta: true,
          type: 'setTempo',
          microsecondsPerBeat: 500_000,
        },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
      [
        {
          deltaTime: 0,
          meta: true,
          type: 'trackName',
          text: 'PART GUITAR',
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 96,
          velocity: 100,
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 101,
          velocity: 100,
        },
        {
          deltaTime: 30,
          type: 'noteOff',
          channel: 0,
          noteNumber: 96,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: 'noteOff',
          channel: 0,
          noteNumber: 101,
          velocity: 0,
        },
        {
          deltaTime: 90,
          type: 'noteOn',
          channel: 0,
          noteNumber: 97,
          velocity: 100,
        },
        {
          deltaTime: 0,
          type: 'noteOn',
          channel: 0,
          noteNumber: 102,
          velocity: 100,
        },
        {
          deltaTime: 30,
          type: 'noteOff',
          channel: 0,
          noteNumber: 97,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: 'noteOff',
          channel: 0,
          noteNumber: 102,
          velocity: 0,
        },
        {
          deltaTime: 90,
          type: 'noteOn',
          channel: 0,
          noteNumber: 98,
          velocity: 100,
        },
        {
          deltaTime: 30,
          type: 'noteOff',
          channel: 0,
          noteNumber: 98,
          velocity: 0,
        },
        {
          deltaTime: 90,
          type: 'noteOn',
          channel: 0,
          noteNumber: 104,
          velocity: 100,
        },
        {
          deltaTime: 120,
          type: 'noteOn',
          channel: 0,
          noteNumber: 99,
          velocity: 100,
        },
        {
          deltaTime: 30,
          type: 'noteOff',
          channel: 0,
          noteNumber: 99,
          velocity: 0,
        },
        {
          deltaTime: 90,
          type: 'noteOff',
          channel: 0,
          noteNumber: 104,
          velocity: 0,
        },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
    ],
  }
  return new Uint8Array(writeMidi(midi))
}

describe('parseMidiCharts', () => {
  it('converts Clone Hero MIDI difficulties into playable charts', () => {
    const metadata = parseSongIni(`[song]
name = Test Song
artist = Test Artist
charter = <color=#ffa500>Test Charter</color>
delay = 125
`)
    const charts = parseMidiCharts(makeMidi(), metadata)

    expect(charts.map((chart) => chart.trackName)).toEqual([
      'ExpertSingle',
      'HardSingle',
    ])
    expect(charts[0].metadata).toMatchObject({
      name: 'Test Song',
      artist: 'Test Artist',
      charter: 'Test Charter',
      offsetSeconds: 0.125,
    })
    expect(charts[0].notes.map((note) => note.lanes)).toEqual([[0], [1]])
    expect(charts[0].notes[0].sustainTicks).toBe(120)
    expect(charts[0].notes[1].hopo).toBe(true)
    expect(charts[1].notes[0].lanes).toEqual([2])
    expect(charts[0].starPowerPhrases).toHaveLength(1)
    expect(charts[0].starPowerPhrases?.[0]).toMatchObject({
      tick: 0,
      tickLength: 240,
    })
    expect(charts[0].notes.every((note) => note.starPower)).toBe(true)
  })

  it('keeps MIDI force-HOPO, force-strum, and tap markers distinct', () => {
    const chart = parseMidiCharts(makeMidiWithModifiers())[0]

    expect(chart.notes.map((note) => note.lanes)).toEqual([
      [0],
      [1],
      [2],
      [3],
    ])
    expect(chart.notes.map((note) => note.hopo)).toEqual([
      true,
      false,
      true,
      true,
    ])
    expect(chart.notes.map((note) => note.forced)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(chart.notes.map((note) => note.tap)).toEqual([
      false,
      false,
      false,
      true,
    ])
  })
})
