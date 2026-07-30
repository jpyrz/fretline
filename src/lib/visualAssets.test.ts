import { describe, expect, it } from 'vitest'
import {
  createLocalVisualAssets,
  selectVisualAsset,
} from './visualAssets'

describe('visual assets', () => {
  it('copies supported local artwork into the requested pool', () => {
    const assets = createLocalVisualAssets(
      [
        new File(['image'], 'stage.webp', {
          type: 'image/webp',
          lastModified: 42,
        }),
        new File(['text'], 'readme.txt', { type: 'text/plain' }),
      ],
      'background',
    )

    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      kind: 'background',
      name: 'stage.webp',
      source: { type: 'local' },
    })
  })

  it('keeps random artwork stable for the same song', () => {
    const assets = createLocalVisualAssets(
      [
        new File(['one'], 'one.png', { type: 'image/png' }),
        new File(['two'], 'two.png', { type: 'image/png' }),
      ],
      'highway',
    )

    const first = selectVisualAsset(assets, 'highway', 'random', 'song-a')
    const second = selectVisualAsset(assets, 'highway', 'random', 'song-a')

    expect(first).not.toBeNull()
    expect(second?.id).toBe(first?.id)
    expect(selectVisualAsset(assets, 'highway', 'default', 'song-a')).toBeNull()
  })
})
