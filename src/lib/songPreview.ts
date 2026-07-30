import type { LocalSong } from '../types/game'

const SONG_MIX = /^song\.[^.]+$/i

export interface SongPreviewFile {
  file: File
  dedicatedPreview: boolean
}

export function previewFileForSong(
  song: LocalSong,
): SongPreviewFile | null {
  if (song.previewAudioFile) {
    return {
      file: song.previewAudioFile,
      dedicatedPreview: true,
    }
  }

  const file =
    song.audioFiles.find((candidate) => SONG_MIX.test(candidate.name)) ??
    song.audioFiles[0]

  return file ? { file, dedicatedPreview: false } : null
}

export function previewOffsetSeconds(
  song: LocalSong,
  durationSeconds: number,
  dedicatedPreview: boolean,
): number {
  if (dedicatedPreview || !Number.isFinite(durationSeconds)) return 0

  const requested =
    song.previewStartSeconds ?? Math.max(0, durationSeconds) * 0.22
  return Math.max(
    0,
    Math.min(requested, Math.max(0, durationSeconds - 1)),
  )
}
