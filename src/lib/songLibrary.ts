import type {
  LocalSong,
  PersistedFileReference,
  VisualAsset,
} from '../types/game'

const DATABASE_NAME = 'fretline-song-library'
const DATABASE_VERSION = 4
const SONG_STORE = 'songs'
const SONG_FILE_STORE = 'song-files'
const PREVIEW_STORE = 'previews'
const VISUAL_ASSET_STORE = 'visual-assets'

interface LegacyPersistedSong extends LocalSong {
  librarySchemaVersion: 1
  savedAt: number
}

interface PersistedSongV2
  extends Omit<
    LocalSong,
    | 'audioFiles'
    | 'previewAudioFile'
    | 'artworkFile'
    | 'persistedFiles'
    | 'legacyPersistedFiles'
  > {
  librarySchemaVersion: 2
  savedAt: number
  persistedFiles: NonNullable<LocalSong['persistedFiles']>
}

interface PersistedSongFile {
  key: string
  bytes: ArrayBuffer
}

interface LegacyPersistedPreview {
  key: string
  file: File
  savedAt: number
}

interface PersistedPreviewV2 {
  key: string
  bytes: ArrayBuffer
  name: string
  type: string
  lastModified: number
  savedAt: number
}

interface PersistedVisualAssetV2
  extends Omit<VisualAsset, 'file'> {
  fileData: {
    bytes: ArrayBuffer
    name: string
    type: string
    lastModified: number
  }
}

let songPersistenceQueue = Promise.resolve()

function storedArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer
  }
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
    ? (value as ArrayBuffer)
    : null
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(
      new Error('This browser does not support a persistent local song library.'),
    )
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SONG_STORE)) {
        database.createObjectStore(SONG_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(SONG_FILE_STORE)) {
        database.createObjectStore(SONG_FILE_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(PREVIEW_STORE)) {
        database.createObjectStore(PREVIEW_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(VISUAL_ASSET_STORE)) {
        database.createObjectStore(VISUAL_ASSET_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('The song library could not be opened.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('The song library transaction failed.'),
      )
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error('The song library transaction was cancelled.'),
      )
  })
}

export async function loadPersistedSongs(): Promise<LocalSong[]> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(SONG_STORE, 'readonly')
    const store = transaction.objectStore(SONG_STORE)
    const request = store.getAll()
    const records = await new Promise<
      Array<LegacyPersistedSong | PersistedSongV2>
    >((resolve, reject) => {
      request.onsuccess = () =>
        resolve(
          request.result as Array<
            LegacyPersistedSong | PersistedSongV2
          >,
        )
      request.onerror = () =>
        reject(
          request.error ?? new Error('Saved songs could not be read.'),
        )
    })
    await transactionComplete(transaction)

    return records
      .filter(
        (record) =>
          (record.librarySchemaVersion === 1 ||
            record.librarySchemaVersion === 2) &&
          record.kind === 'folder' &&
          Array.isArray(record.charts),
      )
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((record) => {
        if (record.librarySchemaVersion === 2) {
          const {
            librarySchemaVersion: _version,
            savedAt: _savedAt,
            persistedFiles,
            ...song
          } = record
          return {
            ...song,
            audioFiles: [],
            persistedFiles,
          } satisfies LocalSong
        }
        const {
          librarySchemaVersion: _version,
          savedAt: _savedAt,
          ...song
        } = record
        return {
          ...song,
          legacyPersistedFiles: true,
        } satisfies LocalSong
      })
  } finally {
    database.close()
  }
}

function fileReference(
  songId: string,
  role: 'audio' | 'preview' | 'artwork',
  index: number,
  file: File,
): PersistedFileReference {
  return {
    key: `${songId}|${role}|${index}`,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  }
}

async function storeSongFile(
  database: IDBDatabase,
  reference: PersistedFileReference,
  file: File,
): Promise<void> {
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength !== file.size) {
    throw new Error(`${file.name} could not be copied into local storage.`)
  }
  const transaction = database.transaction(SONG_FILE_STORE, 'readwrite')
  transaction.objectStore(SONG_FILE_STORE).put({
    key: reference.key,
    bytes,
  } satisfies PersistedSongFile)
  await transactionComplete(transaction)
}

async function persistSongNow(song: LocalSong): Promise<void> {
  if (song.kind !== 'folder' || song.id === 'bundled-techno-chiptale') return
  const database = await openDatabase()

  try {
    let persistedFiles = song.persistedFiles
    if (song.audioFiles.length > 0) {
      const audio = song.audioFiles.map((file, index) =>
        fileReference(song.id, 'audio', index, file),
      )
      const preview = song.previewAudioFile
        ? fileReference(song.id, 'preview', 0, song.previewAudioFile)
        : undefined
      const artwork = song.artworkFile
        ? fileReference(song.id, 'artwork', 0, song.artworkFile)
        : undefined
      for (const [index, file] of song.audioFiles.entries()) {
        await storeSongFile(database, audio[index], file)
      }
      if (preview && song.previewAudioFile) {
        await storeSongFile(database, preview, song.previewAudioFile)
      }
      if (artwork && song.artworkFile) {
        await storeSongFile(database, artwork, song.artworkFile)
      }
      persistedFiles = { version: 2, audio, preview, artwork }
    }
    if (!persistedFiles || persistedFiles.audio.length === 0) {
      throw new Error(`${song.chart.metadata.name} has no stored audio files.`)
    }
    const {
      audioFiles: _audioFiles,
      previewAudioFile: _previewAudioFile,
      artworkFile: _artworkFile,
      legacyPersistedFiles: _legacy,
      persistedFiles: _persisted,
      ...songMetadata
    } = song
    const transaction = database.transaction(SONG_STORE, 'readwrite')
    transaction.objectStore(SONG_STORE).put({
      ...songMetadata,
      persistedFiles,
      librarySchemaVersion: 2,
      savedAt: Date.now(),
    } satisfies PersistedSongV2)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export function persistSong(song: LocalSong): Promise<void> {
  const pending = songPersistenceQueue.then(() => persistSongNow(song))
  songPersistenceQueue = pending.catch(() => undefined)
  return pending
}

async function readStoredFile(
  reference: PersistedFileReference,
): Promise<File> {
  return (await readStoredFiles([reference]))[0]
}

async function readStoredFiles(
  references: PersistedFileReference[],
): Promise<File[]> {
  if (references.length === 0) return []
  const database = await openDatabase()
  try {
    const transaction = database.transaction(SONG_FILE_STORE, 'readonly')
    const completed = transactionComplete(transaction)
    const store = transaction.objectStore(SONG_FILE_STORE)
    const records = await Promise.all(
      references.map(
        (reference) =>
          new Promise<PersistedSongFile | undefined>((resolve, reject) => {
            const request = store.get(reference.key)
            request.onsuccess = () =>
              resolve(request.result as PersistedSongFile | undefined)
            request.onerror = () =>
              reject(
                request.error ??
                  new Error(
                    `${reference.name} could not be read from storage.`,
                  ),
              )
          }),
      ),
    )
    await completed
    return records.map((record, index) => {
      const reference = references[index]
      const bytes = storedArrayBuffer(record?.bytes)
      if (!bytes) {
        throw new Error(
          `The saved copy of ${reference.name} is incomplete. Sync its Google Drive folder again.`,
        )
      }
      return fileFromStoredBytes(reference, bytes)
    })
  } finally {
    database.close()
  }
}

export function fileFromStoredBytes(
  reference: PersistedFileReference,
  bytes: ArrayBuffer,
): File {
  if (bytes.byteLength !== reference.size) {
    throw new Error(
      `The saved copy of ${reference.name} is incomplete. Sync its Google Drive folder again.`,
    )
  }
  return new File([bytes], reference.name, {
    type: reference.type,
    lastModified: reference.lastModified,
  })
}

async function copyLegacyFile(file: Blob, fallbackName: string): Promise<File> {
  if (!(file instanceof Blob)) {
    throw new Error(
      `The saved copy of ${fallbackName} is unavailable. Sync its Google Drive folder again.`,
    )
  }
  const bytes = await file.arrayBuffer()
  const name =
    typeof (file as File).name === 'string'
      ? (file as File).name
      : fallbackName
  if (bytes.byteLength === 0 && file.size > 0) {
    throw new Error(
      `The saved copy of ${name} is incomplete. Sync its Google Drive folder again.`,
    )
  }
  return new File([bytes], name, {
    type: file.type,
    lastModified:
      typeof (file as File).lastModified === 'number'
        ? (file as File).lastModified
        : Date.now(),
  })
}

export async function materializeSongFiles(
  song: LocalSong,
): Promise<LocalSong> {
  if (song.persistedFiles) {
    const references = [
      ...song.persistedFiles.audio,
      ...(song.persistedFiles.preview
        ? [song.persistedFiles.preview]
        : []),
      ...(song.persistedFiles.artwork
        ? [song.persistedFiles.artwork]
        : []),
    ]
    const files = await readStoredFiles(references)
    const audioFiles = files.slice(0, song.persistedFiles.audio.length)
    let nextIndex = audioFiles.length
    return {
      ...song,
      audioFiles,
      previewAudioFile: song.persistedFiles.preview
        ? files[nextIndex++]
        : undefined,
      artworkFile: song.persistedFiles.artwork
        ? files[nextIndex]
        : undefined,
    }
  }
  if (!song.legacyPersistedFiles) return song

  const audioFiles: File[] = []
  for (const [index, file] of song.audioFiles.entries()) {
    audioFiles.push(await copyLegacyFile(file, `audio-${index + 1}`))
  }
  const materialized = {
    ...song,
    audioFiles,
    previewAudioFile: song.previewAudioFile
      ? await copyLegacyFile(song.previewAudioFile, 'preview-audio')
      : undefined,
    artworkFile: song.artworkFile
      ? await copyLegacyFile(song.artworkFile, 'album-artwork')
      : undefined,
    legacyPersistedFiles: false,
  }
  return materialized
}

export function audioFileMetadata(
  song: LocalSong,
): Array<Pick<File, 'name' | 'size' | 'lastModified' | 'type'>> {
  return song.persistedFiles?.audio ?? song.audioFiles
}

export async function loadSongArtwork(song: LocalSong): Promise<File | null> {
  if (song.artworkFile) {
    return song.legacyPersistedFiles
      ? copyLegacyFile(song.artworkFile, 'album-artwork')
      : song.artworkFile
  }
  return song.persistedFiles?.artwork
    ? readStoredFile(song.persistedFiles.artwork)
    : null
}

export async function loadSongPreviewAudio(
  song: LocalSong,
): Promise<File | null> {
  if (song.previewAudioFile) {
    return song.legacyPersistedFiles
      ? copyLegacyFile(song.previewAudioFile, 'preview-audio')
      : song.previewAudioFile
  }
  return song.persistedFiles?.preview
    ? readStoredFile(song.persistedFiles.preview)
    : null
}

export async function deletePersistedSong(songId: string): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(
      [SONG_STORE, SONG_FILE_STORE, PREVIEW_STORE],
      'readwrite',
    )
    transaction.objectStore(SONG_STORE).delete(songId)
    const fileStore = transaction.objectStore(SONG_FILE_STORE)
    const fileKeys = fileStore.getAllKeys()
    fileKeys.onsuccess = () => {
      for (const key of fileKeys.result) {
        if (typeof key === 'string' && key.startsWith(`${songId}|`)) {
          fileStore.delete(key)
        }
      }
    }
    const previewStore = transaction.objectStore(PREVIEW_STORE)
    const previewKeys = previewStore.getAllKeys()
    previewKeys.onsuccess = () => {
      for (const key of previewKeys.result) {
        if (typeof key === 'string' && key.startsWith(`${songId}|`)) {
          previewStore.delete(key)
        }
      }
    }
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function loadPersistedPreview(
  key: string,
): Promise<File | null> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(PREVIEW_STORE, 'readonly')
    const request = transaction.objectStore(PREVIEW_STORE).get(key)
    const record = await new Promise<
      LegacyPersistedPreview | PersistedPreviewV2 | undefined
    >(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(
            request.result as
              | LegacyPersistedPreview
              | PersistedPreviewV2
              | undefined,
          )
        request.onerror = () =>
          reject(
            request.error ??
              new Error('The saved song preview could not be read.'),
          )
      },
    )
    await transactionComplete(transaction)
    if (!record) return null
    if ('bytes' in record) {
      const bytes = storedArrayBuffer(record.bytes)
      if (bytes) {
        return new File([bytes], record.name, {
          type: record.type,
          lastModified: record.lastModified,
        })
      }
    }
    return 'file' in record && record.file instanceof Blob
      ? copyLegacyFile(record.file, 'fretline-preview.wav')
      : null
  } finally {
    database.close()
  }
}

export async function persistPreview(
  key: string,
  file: File,
): Promise<void> {
  const database = await openDatabase()

  try {
    const bytes = await file.arrayBuffer()
    const transaction = database.transaction(PREVIEW_STORE, 'readwrite')
    transaction.objectStore(PREVIEW_STORE).put({
      key,
      bytes,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      savedAt: Date.now(),
    } satisfies PersistedPreviewV2)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function loadPersistedVisualAssets(): Promise<VisualAsset[]> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(VISUAL_ASSET_STORE, 'readonly')
    const request = transaction.objectStore(VISUAL_ASSET_STORE).getAll()
    const records = await new Promise<
      Array<VisualAsset | PersistedVisualAssetV2>
    >((resolve, reject) => {
      request.onsuccess = () =>
        resolve(
          request.result as Array<
            VisualAsset | PersistedVisualAssetV2
          >,
        )
      request.onerror = () =>
        reject(
          request.error ??
            new Error('Saved visual artwork could not be read.'),
        )
    })
    await transactionComplete(transaction)
    const assets: VisualAsset[] = []
    for (const asset of records) {
      if (asset.kind !== 'background' && asset.kind !== 'highway') continue
      if ('fileData' in asset) {
        assets.push({
          ...asset,
          file: new File([asset.fileData.bytes], asset.fileData.name, {
            type: asset.fileData.type,
            lastModified: asset.fileData.lastModified,
          }),
        })
      } else if (asset.file instanceof Blob) {
        assets.push({
          ...asset,
          file: await copyLegacyFile(asset.file, asset.name),
        })
      }
    }
    return assets
  } finally {
    database.close()
  }
}

export async function persistVisualAssets(
  assets: VisualAsset[],
): Promise<void> {
  if (assets.length === 0) return
  const records: PersistedVisualAssetV2[] = []
  for (const asset of assets) {
    const { file, ...metadata } = asset
    records.push({
      ...metadata,
      fileData: {
        bytes: await file.arrayBuffer(),
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
      },
    })
  }
  const database = await openDatabase()

  try {
    const transaction = database.transaction(
      VISUAL_ASSET_STORE,
      'readwrite',
    )
    const store = transaction.objectStore(VISUAL_ASSET_STORE)
    for (const record of records) {
      store.put(record)
    }
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function deletePersistedVisualAsset(
  assetId: string,
): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(
      VISUAL_ASSET_STORE,
      'readwrite',
    )
    transaction.objectStore(VISUAL_ASSET_STORE).delete(assetId)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}
