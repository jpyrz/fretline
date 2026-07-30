import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../types/game'
import { useHomeAudio } from './useHomeAudio'

const audioBuffers = [
  { duration: 120 } as AudioBuffer,
  { duration: 120 } as AudioBuffer,
]

vi.mock('../lib/songAudio', () => ({
  decodeSongAudio: vi.fn(() => Promise.resolve(audioBuffers)),
}))

class FakeHomeAudioContext {
  static sources: Array<{
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    buffer: AudioBuffer | null
  }> = []

  state: AudioContextState = 'running'
  currentTime = 2
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
    FakeHomeAudioContext.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
}

function homeSong(): LocalSong {
  return {
    id: 'home-sync-test',
    kind: 'folder',
    chart: {} as LocalSong['chart'],
    charts: [],
    audioFiles: [
      new File(['backing'], 'song.ogg'),
      new File(['guitar'], 'guitar.ogg'),
    ],
  }
}

describe('useHomeAudio', () => {
  beforeEach(() => {
    FakeHomeAudioContext.sources = []
    vi.stubGlobal('AudioContext', FakeHomeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schedules every stem once on one clock without restarting on navigation', async () => {
    const songs = [homeSong()]
    const { result, unmount } = renderHook(() =>
      useHomeAudio(songs),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('playing')
    })

    expect(FakeHomeAudioContext.sources).toHaveLength(2)
    expect(
      FakeHomeAudioContext.sources.map(
        (source) => source.start.mock.calls.length,
      ),
    ).toEqual([1, 1])
    expect(FakeHomeAudioContext.sources[0].start).toHaveBeenCalledWith(2.04)
    expect(FakeHomeAudioContext.sources[1].start).toHaveBeenCalledWith(2.04)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(
      FakeHomeAudioContext.sources.map(
        (source) => source.start.mock.calls.length,
      ),
    ).toEqual([1, 1])
    unmount()
  })
})
