import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../types/game'
import { useHomeAudio } from './useHomeAudio'

class FakeHomeAudio extends EventTarget {
  static instances: FakeHomeAudio[] = []

  readonly play = vi.fn(() => Promise.resolve())
  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn()
  readyState = HTMLMediaElement.HAVE_METADATA
  duration = 120
  currentTime = 0
  volume = 0
  preload = ''
  src = ''
  onended: (() => void) | null = null

  constructor() {
    super()
    FakeHomeAudio.instances.push(this)
  }
}

function homeSong(): LocalSong {
  return {
    id: 'home-stream-test',
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
    FakeHomeAudio.instances = []
    vi.stubGlobal('Audio', FakeHomeAudio)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams every stem once without restarting on navigation input', async () => {
    const songs = [homeSong()]
    const { result, unmount } = renderHook(() =>
      useHomeAudio(songs),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('playing')
    })

    expect(FakeHomeAudio.instances).toHaveLength(2)
    expect(
      FakeHomeAudio.instances.map((audio) => audio.play.mock.calls.length),
    ).toEqual([1, 1])

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(
      FakeHomeAudio.instances.map((audio) => audio.play.mock.calls.length),
    ).toEqual([1, 1])
    unmount()
  })
})
