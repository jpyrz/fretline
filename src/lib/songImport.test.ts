import { describe, expect, it } from 'vitest'
import { calibrationChartSource } from './calibrationSong'
import { importCloneHeroFolder } from './songImport'

describe('importCloneHeroFolder', () => {
  it('loads a chart and its local audio files', async () => {
    const chart = new File([calibrationChartSource], 'notes.chart', {
      type: 'text/plain',
      lastModified: 123,
    })
    const audio = new File(['test-audio'], 'song.ogg', {
      type: 'audio/ogg',
    })

    const song = await importCloneHeroFolder([chart, audio])

    expect(song.kind).toBe('folder')
    expect(song.chart.metadata.name).toBe('Timing Lab')
    expect(song.audioFiles).toEqual([audio])
  })

  it('keeps album artwork and excludes preview audio from gameplay', async () => {
    const chart = new File([calibrationChartSource], 'notes.chart')
    const songAudio = new File(['song-audio'], 'song.ogg')
    const previewAudio = new File(['preview-audio'], 'preview.mp3')
    const artwork = new File(['cover'], 'album.png', {
      type: 'image/png',
    })

    const song = await importCloneHeroFolder([
      chart,
      songAudio,
      previewAudio,
      artwork,
    ])

    expect(song.audioFiles).toEqual([songAudio])
    expect(song.artworkFile).toBe(artwork)
  })

  it('reads the preferred preview position from song.ini', async () => {
    const chart = new File([calibrationChartSource], 'notes.chart')
    const audio = new File(['song-audio'], 'song.ogg')
    const ini = new File(
      ['[song]\nname = Preview test\npreview_start_time = 42000'],
      'song.ini',
    )

    const song = await importCloneHeroFolder([chart, audio, ini])

    expect(song.previewStartSeconds).toBe(42)
  })

  it('reports a missing chart clearly', async () => {
    const audio = new File(['test-audio'], 'song.ogg', {
      type: 'audio/ogg',
    })

    await expect(importCloneHeroFolder([audio])).rejects.toThrow(
      'No notes.chart',
    )
  })

  it('loads every available difficulty and instrument track', async () => {
    const source = `${calibrationChartSource}
[HardDoubleBass]
{
  768 = N 2 0
}`
    const chart = new File([source], 'notes.chart')
    const audio = new File(['test-audio'], 'song.ogg')

    const song = await importCloneHeroFolder([chart, audio])

    expect(song.charts.map((candidate) => candidate.trackName)).toEqual([
      'ExpertSingle',
      'HardDoubleBass',
    ])
    expect(song.charts[1].notes).toHaveLength(1)
  })
})
