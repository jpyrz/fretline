import { describe, expect, it } from 'vitest'
import {
  createDriveFingerprint,
  type DriveFileMetadata,
} from './googleDrive'

describe('createDriveFingerprint', () => {
  it('includes the chart importer version so parser fixes trigger a resync', () => {
    expect(createDriveFingerprint([])).toBe('chart-import-v3|')
  })

  it('is stable across Drive listing order and ignores unrelated files', () => {
    const chart: DriveFileMetadata = {
      id: 'chart-id',
      name: 'notes.chart',
      mimeType: 'text/plain',
      modifiedTime: '2026-07-28T10:00:00Z',
      size: '123',
    }
    const audio: DriveFileMetadata = {
      id: 'audio-id',
      name: 'song.ogg',
      mimeType: 'audio/ogg',
      modifiedTime: '2026-07-28T10:01:00Z',
      size: '456',
    }
    const unrelated: DriveFileMetadata = {
      id: 'unrelated-id',
      name: 'lyrics.txt',
      mimeType: 'text/plain',
      modifiedTime: '2026-07-28T10:02:00Z',
      size: '789',
    }

    expect(createDriveFingerprint([chart, audio, unrelated])).toBe(
      createDriveFingerprint([audio, chart]),
    )
  })

  it('changes when a chart or audio file changes', () => {
    const before: DriveFileMetadata = {
      id: 'chart-id',
      name: 'notes.chart',
      mimeType: 'text/plain',
      modifiedTime: '2026-07-28T10:00:00Z',
      size: '123',
    }
    const after = {
      ...before,
      modifiedTime: '2026-07-28T10:05:00Z',
    }

    expect(createDriveFingerprint([before])).not.toBe(
      createDriveFingerprint([after]),
    )
  })

  it('tracks MIDI charts, metadata, and artwork but ignores preview audio', () => {
    const midi: DriveFileMetadata = {
      id: 'midi-id',
      name: 'notes.mid',
      mimeType: 'audio/midi',
      modifiedTime: '2026-07-28T10:00:00Z',
      size: '123',
    }
    const ini: DriveFileMetadata = {
      id: 'ini-id',
      name: 'song.ini',
      mimeType: 'text/plain',
      modifiedTime: '2026-07-28T10:01:00Z',
      size: '456',
    }
    const preview: DriveFileMetadata = {
      id: 'preview-id',
      name: 'preview.mp3',
      mimeType: 'audio/mpeg',
      modifiedTime: '2026-07-28T10:02:00Z',
      size: '789',
    }
    const artwork: DriveFileMetadata = {
      id: 'artwork-id',
      name: 'album.png',
      mimeType: 'image/png',
      modifiedTime: '2026-07-28T10:03:00Z',
      size: '999',
    }

    const fingerprint = createDriveFingerprint([
      midi,
      ini,
      preview,
      artwork,
    ])
    expect(fingerprint).toContain('midi-id')
    expect(fingerprint).toContain('ini-id')
    expect(fingerprint).toContain('artwork-id')
    expect(fingerprint).not.toContain(
      'preview-id',
    )
  })
})
