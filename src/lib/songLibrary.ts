import type { LocalSong } from '../types/game'

const DATABASE_NAME = 'fretline-song-library'
const DATABASE_VERSION = 2
const SONG_STORE = 'songs'
const PREVIEW_STORE = 'previews'

interface PersistedSong extends LocalSong {
  librarySchemaVersion: 1
  savedAt: number
}

interface PersistedPreview {
  key: string
  file: File
  savedAt: number
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
      if (!database.objectStoreNames.contains(PREVIEW_STORE)) {
        database.createObjectStore(PREVIEW_STORE, { keyPath: 'key' })
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
    const records = await new Promise<PersistedSong[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as PersistedSong[])
      request.onerror = () =>
        reject(
          request.error ?? new Error('Saved songs could not be read.'),
        )
    })
    await transactionComplete(transaction)

    return records
      .filter(
        (record) =>
          record.librarySchemaVersion === 1 &&
          record.kind === 'folder' &&
          Array.isArray(record.charts) &&
          Array.isArray(record.audioFiles),
      )
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(({ librarySchemaVersion: _version, savedAt: _savedAt, ...song }) => song)
  } finally {
    database.close()
  }
}

export async function persistSong(song: LocalSong): Promise<void> {
  if (song.kind !== 'folder' || song.id === 'bundled-techno-chiptale') return
  const database = await openDatabase()

  try {
    const transaction = database.transaction(SONG_STORE, 'readwrite')
    transaction.objectStore(SONG_STORE).put({
      ...song,
      librarySchemaVersion: 1,
      savedAt: Date.now(),
    } satisfies PersistedSong)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function deletePersistedSong(songId: string): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(
      [SONG_STORE, PREVIEW_STORE],
      'readwrite',
    )
    transaction.objectStore(SONG_STORE).delete(songId)
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
    const record = await new Promise<PersistedPreview | undefined>(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(request.result as PersistedPreview | undefined)
        request.onerror = () =>
          reject(
            request.error ??
              new Error('The saved song preview could not be read.'),
          )
      },
    )
    await transactionComplete(transaction)
    return record?.file instanceof File ? record.file : null
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
    const transaction = database.transaction(PREVIEW_STORE, 'readwrite')
    transaction.objectStore(PREVIEW_STORE).put({
      key,
      file,
      savedAt: Date.now(),
    } satisfies PersistedPreview)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}
