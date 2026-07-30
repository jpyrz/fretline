import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../types/game'
import { useSongPreview } from './useSongPreview'

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []

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

  constructor() {
    super()
    FakeAudio.instances.push(this)
  }
}

function previewSong(): LocalSong {
  return {
    id: 'preview-controller-test',
    kind: 'folder',
    chart: {} as LocalSong['chart'],
    charts: [],
    audioFiles: [new File(['audio'], 'song.ogg')],
  }
}

describe('useSongPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeAudio.instances = []
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview-test'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not restart playback when menu navigation unlock events fire', async () => {
    const { unmount } = renderHook(() =>
      useSongPreview(previewSong()),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    const audio = FakeAudio.instances[0]
    expect(audio.play).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(audio.play).toHaveBeenCalledTimes(1)
    unmount()
  })
})
