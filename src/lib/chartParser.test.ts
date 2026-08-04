/** @vitest-environment node */
/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { calibrationChartSource } from './calibrationSong'
import { parseChart, secondsToTick, tickToSeconds } from './chartParser'

describe('parseChart', () => {
  it('parses the generated Clone Hero chart and groups chords', () => {
    const chart = parseChart(calibrationChartSource)

    expect(chart.metadata.resolution).toBe(192)
    expect(chart.trackName).toBe('ExpertSingle')
    expect(chart.notes).toHaveLength(20)
    expect(chart.notes[0].timeSeconds).toBe(0)
    expect(chart.notes[8].lanes).toEqual([0, 4])
    expect(chart.notes[8].timeSeconds).toBe(8)
  })

  it('integrates multiple BPM segments', () => {
    const tempos = [
      { tick: 0, bpm: 120, timeSeconds: 0 },
      { tick: 192, bpm: 60, timeSeconds: 0.5 },
    ]

    expect(tickToSeconds(384, tempos, 192)).toBe(1.5)
    expect(secondsToTick(1.5, tempos, 192)).toBe(384)
  })

  it('adds an imported song delay to the chart offset', () => {
    const chart = parseChart(calibrationChartSource, undefined, 0.125)

    expect(chart.metadata.offsetSeconds).toBe(0.125)
    expect(chart.notes[0].timeSeconds).toBe(0.125)
  })

  it('parses the bundled real-song chart at its analyzed beat offset', () => {
    const source = readFileSync(
      new URL('../../public/songs/techno-chiptale/notes.chart', import.meta.url),
      'utf8',
    )
    const chart = parseChart(source)

    expect(chart.metadata.name).toBe('Techno Chiptale')
    expect(chart.metadata.offsetSeconds).toBe(0.34)
    expect(chart.notes).toHaveLength(87)
    expect(chart.notes[0].timeSeconds).toBeCloseTo(3.0067, 3)
    expect(chart.notes.some((note) => note.lanes.length === 2)).toBe(true)
    expect(chart.notes.some((note) => note.sustainTicks === 384)).toBe(true)
  })

  it('classifies natural, forced, and tap notes', () => {
    const chart = parseChart(`[Song]
{
  Name = "Mechanics"
  Artist = "Fretline"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  64 = N 1 0
  128 = N 2 0
  128 = N 5 0
  320 = N 3 0
  320 = N 5 0
  512 = N 4 0
  512 = N 6 0
}`)

    expect(chart.notes.map((note) => note.hopo)).toEqual([
      false,
      true,
      false,
      true,
      true,
    ])
    expect(chart.notes[2].forced).toBe(true)
    expect(chart.notes[4].tap).toBe(true)
  })

  it('retains star power phrases and marks every note inside them', () => {
    const chart = parseChart(`[Song]
{
  Name = "Star Power"
  Artist = "Fretline"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = S 2 192
  0 = N 0 0
  96 = N 1 0
  192 = N 2 0
  288 = N 3 0
}`)

    expect(chart.starPowerPhrases).toEqual([
      {
        tick: 0,
        tickLength: 192,
        timeSeconds: 0,
        endTimeSeconds: 0.5,
      },
    ])
    expect(chart.notes.map((note) => note.starPower)).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(chart.notes[1].starPowerPhraseIndices).toEqual([0])
  })

  it('turns authored section events into bounded practice ranges', () => {
    const chart = parseChart(`[Song]
{
  Name = "Sections"
  Artist = "Fretline"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[Events]
{
  0 = E "section Intro"
  384 = E "section Guitar_Solo"
}
[ExpertSingle]
{
  0 = N 0 0
  384 = N 1 0
  768 = N 2 0
}`)

    expect(chart.practiceSections).toEqual([
      {
        id: '0:intro',
        name: 'Intro',
        startTimeSeconds: 0,
        endTimeSeconds: 1,
      },
      {
        id: '384:guitar solo',
        name: 'Guitar Solo',
        startTimeSeconds: 1,
        endTimeSeconds: 3.5,
      },
    ])
  })
})
