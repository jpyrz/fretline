import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  LocalSong,
  ParsedChart,
  PersistedFileReference,
} from '../types/game'
import {
  audioFileMetadata,
  deletePersistedSong,
  fileFromStoredBytes,
  loadPersistedSongs,
  materializeSongFiles,
  persistSong,
} from './songLibrary'

const guitarReference: PersistedFileReference = {
  key: 'song-1|audio|0',
  name: 'guitar.ogg',
  type: 'audio/ogg',
  size: 4,
  lastModified: 1234,
}

describe('song library file persistence', () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('fretline-song-library')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Database deletion was blocked.'))
    })
  })

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

  it('persists metadata separately and lazily restores audio bytes', async () => {
    const sourceBytes = new Uint8Array([79, 103, 103, 83])
    const chart: ParsedChart = {
      metadata: {
        name: 'Round Trip',
        artist: 'Fretline',
        charter: 'Test',
        resolution: 192,
        offsetSeconds: 0,
      },
      notes: [],
      tempos: [],
      trackName: 'ExpertSingle',
      availableTracks: ['ExpertSingle'],
      durationSeconds: 1,
    }
    const song = {
      id: 'round-trip-song',
      kind: 'folder',
      chart,
      charts: [chart],
      audioFiles: [
        new File([sourceBytes], 'guitar.ogg', {
          type: 'audio/ogg',
          lastModified: 4321,
        }),
      ],
      folderName: 'Round Trip',
    } satisfies LocalSong

    await persistSong(song)
    const [stored] = await loadPersistedSongs()

    expect(stored.audioFiles).toEqual([])
    expect(stored.persistedFiles?.audio).toHaveLength(1)

    const restored = await materializeSongFiles(stored)
    expect(restored.audioFiles[0].name).toBe('guitar.ogg')
    expect([
      ...new Uint8Array(await restored.audioFiles[0].arrayBuffer()),
    ]).toEqual([...sourceBytes])
  })

  it('deletes song metadata and all associated files', async () => {
    const chart: ParsedChart = {
      metadata: {
        name: 'Delete Me',
        artist: 'Fretline',
        charter: 'Test',
        resolution: 192,
        offsetSeconds: 0,
      },
      notes: [],
      tempos: [],
      trackName: 'ExpertSingle',
      availableTracks: ['ExpertSingle'],
      durationSeconds: 1,
    }
    const song = {
      id: 'delete-song',
      kind: 'folder',
      chart,
      charts: [chart],
      audioFiles: [new File(['audio'], 'song.ogg')],
    } satisfies LocalSong

    await persistSong(song)
    await deletePersistedSong(song.id)

    expect(await loadPersistedSongs()).toEqual([])
  })
})
