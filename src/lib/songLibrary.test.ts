import { describe, expect, it } from 'vitest'
import type { LocalSong, PersistedFileReference } from '../types/game'
import {
  audioFileMetadata,
  fileFromStoredBytes,
} from './songLibrary'

const guitarReference: PersistedFileReference = {
  key: 'song-1|audio|0',
  name: 'guitar.ogg',
  type: 'audio/ogg',
  size: 4,
  lastModified: 1234,
}

describe('song library file persistence', () => {
  it('rebuilds a browser file from stored bytes and metadata', async () => {
    const bytes = new Uint8Array([79, 103, 103, 83]).buffer
    const file = fileFromStoredBytes(guitarReference, bytes)

    expect(file.name).toBe('guitar.ogg')
    expect(file.type).toBe('audio/ogg')
    expect(file.lastModified).toBe(1234)
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
      79, 103, 103, 83,
    ])
  })

  it('rejects an incomplete stored audio record', () => {
    expect(() =>
      fileFromStoredBytes(guitarReference, new ArrayBuffer(2)),
    ).toThrow('saved copy of guitar.ogg is incomplete')
  })

  it('retains stem metadata without eagerly loading song bytes', () => {
    const song = {
      id: 'song-1',
      kind: 'folder',
      chart: {} as LocalSong['chart'],
      charts: [],
      audioFiles: [],
      persistedFiles: {
        version: 2,
        audio: [guitarReference],
      },
    } satisfies LocalSong

    expect(audioFileMetadata(song)).toEqual([guitarReference])
  })
})
