import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../types/game'
import { useHomeAudio } from './useHomeAudio'

vi.mock('../lib/songPreviewCache', () => ({
  prepareSongPreview: vi.fn(() =>
    Promise.resolve(new File(['preview'], 'fretline-preview.wav')),
  ),
}))

class FakeHomeAudio extends EventTarget {
  static instances: FakeHomeAudio[] = []

  readonly play = vi.fn(() => Promise.resolve())
  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn()
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
    id: 'home-preview-test',
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
      createObjectURL: vi.fn(() => 'blob:home-preview-test'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plays one mixed preview without restarting on navigation', async () => {
    const songs = [homeSong()]
    const { result, unmount } = renderHook(() =>
      useHomeAudio(songs),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('playing')
    })

    expect(FakeHomeAudio.instances).toHaveLength(1)
    expect(FakeHomeAudio.instances[0].play).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(FakeHomeAudio.instances[0].play).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('honors the saved Home music default without blocking playback', async () => {
    const { result, unmount } = renderHook(() =>
      useHomeAudio([homeSong()], true),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('playing')
    })

    expect(result.current.muted).toBe(true)
    expect(FakeHomeAudio.instances[0].volume).toBe(0)
    expect(FakeHomeAudio.instances[0].play).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('updates progress from media events instead of a continuous frame loop', async () => {
    const frameSpy = vi.spyOn(window, 'requestAnimationFrame')
    const songs = [homeSong()]
    const { result, unmount } = renderHook(() =>
      useHomeAudio(songs),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('playing')
    })
    expect(FakeHomeAudio.instances).toHaveLength(1)
    expect(frameSpy).not.toHaveBeenCalled()
    frameSpy.mockRestore()
    unmount()
  })
})
