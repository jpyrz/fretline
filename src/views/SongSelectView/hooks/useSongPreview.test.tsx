import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSong } from '../../../types/game'
import { useSongPreview } from './useSongPreview'

vi.mock('../../../lib/songPreviewCache', () => ({
  prepareSongPreview: vi.fn(() =>
    Promise.resolve(new File(['preview'], 'fretline-preview.wav')),
  ),
}))

class FakePreviewAudio extends EventTarget {
  static instances: FakePreviewAudio[] = []

  readonly play = vi.fn(() => Promise.resolve())
  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn()
  currentTime = 0
  volume = 0
  preload = ''
  src = ''

  constructor() {
    super()
    FakePreviewAudio.instances.push(this)
  }
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
    FakePreviewAudio.instances = []
    vi.stubGlobal('Audio', FakePreviewAudio)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview-test'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plays one mixed preview without restarting on navigation', async () => {
    const { unmount } = renderHook(() =>
      useSongPreview(previewSong()),
    )

    await waitFor(() => {
      expect(FakePreviewAudio.instances).toHaveLength(1)
      expect(FakePreviewAudio.instances[0].play).toHaveBeenCalledTimes(1)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      window.dispatchEvent(new Event('fretline:controller-action'))
    })

    expect(FakePreviewAudio.instances[0].play).toHaveBeenCalledTimes(1)
    unmount()
  })
})
