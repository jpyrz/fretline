import { createConcurrencyLimiter } from './concurrency'
import { decodeAudioFiles } from './songImport'
import {
  loadPersistedPreview,
  persistPreview,
} from './songLibrary'
import { previewOffsetSeconds } from './songPreview'
import type { LocalSong } from '../types/game'

const PREVIEW_CACHE_VERSION = 1
const PREVIEW_DURATION_SECONDS = 16
const PREVIEW_SAMPLE_RATE = 24_000
const PREVIEW_CHANNELS = 2
const previewLimiter = createConcurrencyLimiter(1)
const pendingPreviews = new Map<string, Promise<File>>()

interface PreviewChannelSource {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

export interface PreviewPreparationProgress {
  completed: number
  total: number
  song: LocalSong
  failed: number
}

export interface PreviewPreparationResult {
  prepared: number
  failed: number
}

export function songPreviewCacheKey(song: LocalSong): string {
  const files = song.previewAudioFile
    ? [song.previewAudioFile]
    : song.audioFiles
  const fingerprint = files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join('|')
  return (
    `${song.id}|preview-v${PREVIEW_CACHE_VERSION}|` +
    `${song.previewStartSeconds ?? ''}|${fingerprint}`
  )
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function encodeWave(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Blob {
  const frameCount = Math.min(left.length, right.length)
  const bytesPerSample = 2
  const dataBytes = frameCount * PREVIEW_CHANNELS * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, PREVIEW_CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(
    28,
    sampleRate * PREVIEW_CHANNELS * bytesPerSample,
    true,
  )
  view.setUint16(32, PREVIEW_CHANNELS * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let byteOffset = 44
  for (let index = 0; index < frameCount; index += 1) {
    view.setInt16(
      byteOffset,
      Math.round(Math.max(-1, Math.min(1, left[index])) * 0x7fff),
      true,
    )
    view.setInt16(
      byteOffset + bytesPerSample,
      Math.round(Math.max(-1, Math.min(1, right[index])) * 0x7fff),
      true,
    )
    byteOffset += PREVIEW_CHANNELS * bytesPerSample
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function mixPreviewBuffers(
  buffers: AudioBuffer[],
  offsetSeconds: number,
): File {
  const availableSeconds = Math.max(
    0,
    Math.max(...buffers.map((buffer) => buffer.duration)) - offsetSeconds,
  )
  const durationSeconds = Math.min(
    PREVIEW_DURATION_SECONDS,
    availableSeconds,
  )
  const frameCount = Math.max(
    1,
    Math.floor(durationSeconds * PREVIEW_SAMPLE_RATE),
  )
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  const sources: PreviewChannelSource[] = buffers.map((buffer) => ({
    left: buffer.getChannelData(0),
    right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)),
    sampleRate: buffer.sampleRate,
  }))
  const stemGain = 0.82 / Math.sqrt(Math.max(1, sources.length))
  let peak = 0

  for (let frame = 0; frame < frameCount; frame += 1) {
    const timeSeconds = offsetSeconds + frame / PREVIEW_SAMPLE_RATE
    let leftSample = 0
    let rightSample = 0
    for (const source of sources) {
      const sourceIndex = Math.floor(timeSeconds * source.sampleRate)
      if (sourceIndex >= source.left.length) continue
      leftSample += source.left[sourceIndex] * stemGain
      rightSample += source.right[sourceIndex] * stemGain
    }
    left[frame] = leftSample
    right[frame] = rightSample
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample))
  }

  if (peak > 0.98) {
    const scale = 0.98 / peak
    for (let frame = 0; frame < frameCount; frame += 1) {
      left[frame] *= scale
      right[frame] *= scale
    }
  }

  return new File(
    [encodeWave(left, right, PREVIEW_SAMPLE_RATE)],
    'fretline-preview.wav',
    { type: 'audio/wav', lastModified: Date.now() },
  )
}

async function generateSongPreview(song: LocalSong): Promise<File> {
  if (song.previewAudioFile) return song.previewAudioFile
  if (song.audioFiles.length === 0) {
    throw new Error(`${song.chart.metadata.name} does not contain audio.`)
  }

  const context = new AudioContext({ latencyHint: 'playback' })
  try {
    const buffers = await decodeAudioFiles(context, song.audioFiles)
    const duration = Math.max(...buffers.map((buffer) => buffer.duration))
    const offset = previewOffsetSeconds(song, duration, false)
    return mixPreviewBuffers(buffers, offset)
  } finally {
    await context.close().catch(() => undefined)
  }
}

export function prepareSongPreview(song: LocalSong): Promise<File> {
  if (song.previewAudioFile) return Promise.resolve(song.previewAudioFile)
  const key = songPreviewCacheKey(song)
  const existing = pendingPreviews.get(key)
  if (existing) return existing

  const pending = loadPersistedPreview(key)
    .then((persisted) => {
      if (persisted) return persisted
      return previewLimiter.run(async () => {
        const completedWhileQueued = await loadPersistedPreview(key)
        if (completedWhileQueued) return completedWhileQueued
        const preview = await generateSongPreview(song)
        await persistPreview(key, preview)
        return preview
      })
    })
    .finally(() => pendingPreviews.delete(key))
  pendingPreviews.set(key, pending)
  return pending
}

export async function prepareSongPreviews(
  songs: LocalSong[],
  onProgress?: (progress: PreviewPreparationProgress) => void,
): Promise<PreviewPreparationResult> {
  let completed = 0
  let prepared = 0
  let failed = 0
  for (const song of songs) {
    try {
      await prepareSongPreview(song)
      prepared += 1
    } catch {
      failed += 1
    }
    completed += 1
    onProgress?.({ completed, total: songs.length, song, failed })
  }
  return { prepared, failed }
}
