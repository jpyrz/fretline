import type { LocalSong } from '../types/game'

export interface SongPreviewSelection {
  files: File[]
  dedicatedPreview: boolean
}

export function previewFilesForSong(
  song: LocalSong,
): SongPreviewSelection | null {
  if (song.previewAudioFile) {
    return {
      files: [song.previewAudioFile],
      dedicatedPreview: true,
    }
  }

  return song.audioFiles.length > 0
    ? {
        files: song.audioFiles,
        dedicatedPreview: false,
      }
    : null
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
