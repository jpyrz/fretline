import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../types/game'
import { useSongPreview } from './useSongPreview'

const audioBuffers = [
  { duration: 120 } as AudioBuffer,
  { duration: 120 } as AudioBuffer,
]

vi.mock('../lib/songAudio', () => ({
  decodeSongAudio: vi.fn(() => Promise.resolve(audioBuffers)),
  registerPreviewAudioContext: vi.fn(),
  releasePreviewAudioContext: vi.fn(() => false),
  unlockSongAudioDecoder: vi.fn(),
}))

class FakeAudioContext {
  static sources: Array<{
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    buffer: AudioBuffer | null
  }> = []

  state: AudioContextState = 'running'
  currentTime = 1
  destination = {} as AudioDestinationNode

  createDynamicsCompressor() {
    return { connect: vi.fn() } as unknown as DynamicsCompressorNode
  }

  createGain() {
    return {
      context: this,
      connect: vi.fn(),
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
    } as unknown as GainNode
  }

  createBufferSource() {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }
    FakeAudioContext.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
}

function previewSong(): LocalSong {
  return {
    id: 'preview-controller-test',
    kind: 'folder',
    chart: {} as LocalSong['chart'],
    charts: [],
    audioFiles: [
      new File(['backing'], 'song.ogg'),
      new File(['guitar'], 'guitar.ogg'),
    ],
  }
}

describe('useSongPreview', () => {
  beforeEach(() => {
    FakeAudioContext.sources = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schedules every stem once on one clock without restarting on navigation', async () => {
    const { unmount } = renderHook(() =>
      useSongPreview(previewSong()),
    )

    await waitFor(() => {
      expect(FakeAudioContext.sources).toHaveLength(2)
    })

    expect(
      FakeAudioContext.sources.map((source) => source.start.mock.calls.length),
    ).toEqual([1, 1])
    expect(FakeAudioContext.sources[0].start.mock.calls[0]).toEqual([
      1.03,
      26.4,
    ])
    expect(FakeAudioContext.sources[1].start.mock.calls[0]).toEqual([
      1.03,
      26.4,
    ])

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(
      FakeAudioContext.sources.map((source) => source.start.mock.calls.length),
    ).toEqual([1, 1])
    unmount()
  })
})
