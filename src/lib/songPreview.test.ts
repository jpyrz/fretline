import { describe, expect, it } from 'vitest'
import type { LocalSong } from '../types/game'
import {
  previewFilesForSong,
  previewOffsetSeconds,
} from './songPreview'

function songWithAudio(
  audioFiles: File[],
  previewAudioFile?: File,
): LocalSong {
  return {
    id: 'preview-test',
    kind: 'folder',
    chart: {} as LocalSong['chart'],
    charts: [],
    audioFiles,
    previewAudioFile,
  }
}

describe('song previews', () => {
  it('prefers a dedicated preview clip', () => {
    const mix = new File(['mix'], 'song.ogg')
    const preview = new File(['preview'], 'preview.ogg')

    expect(previewFilesForSong(songWithAudio([mix], preview))).toEqual({
      files: [preview],
      dedicatedPreview: true,
    })
  })

  it('streams every gameplay stem when no rendered preview exists', () => {
    const guitar = new File(['guitar'], 'guitar.ogg')
    const drums = new File(['drums'], 'drums.ogg')
    const mix = new File(['mix'], 'song.ogg')

    expect(
      previewFilesForSong(songWithAudio([mix, guitar, drums])),
    ).toEqual({
      files: [mix, guitar, drums],
      dedicatedPreview: false,
    })
  })

  it('uses a safe song offset but starts dedicated clips at zero', () => {
    const song = songWithAudio([])
    song.previewStartSeconds = 42

    expect(previewOffsetSeconds(song, 180, false)).toBe(42)
    expect(previewOffsetSeconds(song, 30, true)).toBe(0)
    expect(previewOffsetSeconds(song, 30, false)).toBe(29)
  })
})
