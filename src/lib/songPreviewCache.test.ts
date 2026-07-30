import { describe, expect, it } from 'vitest'
import {
  mixPreviewBuffers,
  songPreviewCacheKey,
} from './songPreviewCache'
import type { LocalSong } from '../types/game'

function testSong(audioFiles: File[]): LocalSong {
  return {
    id: 'preview-song',
    kind: 'folder',
    chart: {
      metadata: { name: 'Preview Song' },
    } as LocalSong['chart'],
    charts: [],
    audioFiles,
  }
}

function testBuffer(
  sampleRate: number,
  durationSeconds: number,
  value: number,
): AudioBuffer {
  const samples = new Float32Array(sampleRate * durationSeconds)
  samples.fill(value)
  return {
    duration: durationSeconds,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer
}

describe('song preview cache', () => {
  it('invalidates a generated preview when its source audio changes', () => {
    const before = new File(['one'], 'guitar.ogg', { lastModified: 1 })
    const after = new File(['two-two'], 'guitar.ogg', { lastModified: 2 })
    expect(songPreviewCacheKey(testSong([before]))).not.toBe(
      songPreviewCacheKey(testSong([after])),
    )
  })

  it('mixes stems into a playable stereo wave preview', async () => {
    const file = mixPreviewBuffers(
      [testBuffer(48_000, 20, 0.2), testBuffer(44_100, 20, 0.1)],
      2,
    )
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    expect(new TextDecoder().decode(header.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(header.slice(8, 12))).toBe('WAVE')
    expect(file.type).toBe('audio/wav')
    expect(file.size).toBe(44 + 16 * 24_000 * 2 * 2)
  })
})
