import { useEffect, useRef, useState } from 'react'
import {
  authorizeGoogleDrive,
  connectGoogleDrive,
  isGoogleDriveConfigured,
  loadDriveLibrarySource,
  prepareGoogleDrive,
  saveDriveLibrarySource,
  syncGoogleDriveLibrary,
  type DriveLibrarySource,
} from '../../../../lib/googleDrive'
import {
  prepareSongPreview,
  prepareSongPreviews,
} from '../../../../lib/songPreviewCache'
import {
  importCloneHeroFolder,
  loadBundledSong,
} from '../../../../lib/songImport'
import type { LocalSong } from '../../../../types/game'

interface SongLibraryActionsOptions {
  songs: LocalSong[]
  libraryReady: boolean
  setSong: (song: LocalSong) => void
  selectSong: (songId: string) => void
  addImportedSong: (song: LocalSong) => Promise<void>
}

export function useSongLibraryActions({
  songs,
  libraryReady,
  setSong,
  selectSong,
  addImportedSong,
}: SongLibraryActionsOptions) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [driveStatus, setDriveStatus] = useState('')
  const [driveSource, setDriveSource] = useState<DriveLibrarySource | null>(
    loadDriveLibrarySource,
  )
  const driveConfigured = isGoogleDriveConfigured()
  const [driveReady, setDriveReady] = useState(!driveConfigured)

  useEffect(() => {
    if (!driveConfigured) return
    let active = true
    void prepareGoogleDrive().finally(() => {
      if (active) setDriveReady(true)
    })
    return () => {
      active = false
    }
  }, [driveConfigured])

  const openFolderPicker = () => {
    if (!inputRef.current) return
    inputRef.current.setAttribute('webkitdirectory', '')
    inputRef.current.click()
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    setError('')
    try {
      const imported = await importCloneHeroFolder(files)
      setSong(imported)
      try {
        await prepareSongPreview(imported)
      } catch {
        setError(
          `${imported.chart.metadata.name} was added, but its preview could not be prepared.`,
        )
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const loadBundledSample = async () => {
    const existing = songs.find(
      (candidate) => candidate.id === 'bundled-techno-chiptale',
    )
    if (existing) {
      selectSong(existing.id)
      return
    }
    setImporting(true)
    setError('')
    try {
      setSong(await loadBundledSong())
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Sample song failed to load.',
      )
    } finally {
      setImporting(false)
    }
  }

  const syncDrive = async (chooseFolder = false) => {
    setImporting(true)
    setError('')
    setDriveStatus(
      chooseFolder || !driveSource
        ? 'Opening Google Drive…'
        : `Connecting to ${driveSource.name}…`,
    )

    try {
      let source = driveSource
      let accessToken: string
      if (chooseFolder || !source) {
        const connection = await connectGoogleDrive()
        if (!connection.source) {
          setDriveStatus('')
          return
        }
        source = connection.source
        accessToken = connection.accessToken
        saveDriveLibrarySource(source)
        setDriveSource(source)
      } else {
        accessToken = await authorizeGoogleDrive()
      }

      let preparedDuringSync = 0
      let previewFailures = 0
      const result = await syncGoogleDriveLibrary(
        source,
        accessToken,
        songs,
        (progress) => setDriveStatus(progress.message),
        async (importedSong) => {
          await addImportedSong(importedSong)
          try {
            await prepareSongPreview(importedSong)
            preparedDuringSync += 1
            setDriveStatus(
              `Preparing previews · ${preparedDuringSync} songs ready`,
            )
          } catch {
            previewFailures += 1
          }
        },
      )
      const previewSongs = songs.filter(
        (candidate) =>
          candidate.kind === 'folder' &&
          candidate.source?.type === 'google-drive' &&
          candidate.source.rootFolderId === source.id,
      )
      if (previewSongs.length > 0) {
        setDriveStatus(`Preparing previews for ${previewSongs.length} songs…`)
        const previewResult = await prepareSongPreviews(
          previewSongs,
          (progress) => {
            setDriveStatus(
              `Preparing previews · ${progress.completed} of ${progress.total}`,
            )
          },
        )
        previewFailures += previewResult.failed
      }
      if (result.discovered === 0) {
        setDriveStatus(
          `No compatible song folders were found in ${source.name}.`,
        )
      } else if (result.songs.length === 0) {
        setDriveStatus(
          `${source.name} is up to date · ${result.unchanged} songs checked.` +
            (previewFailures
              ? ` ${previewFailures} previews could not be prepared.`
              : ''),
        )
      } else {
        setDriveStatus(
          `Added or updated ${result.songs.length} songs` +
            (result.unchanged
              ? ` · ${result.unchanged} already current.`
              : '.') +
            (previewFailures
              ? ` ${previewFailures} previews could not be prepared.`
              : ''),
        )
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Google Drive sync failed.',
      )
      setDriveStatus('')
    } finally {
      setImporting(false)
    }
  }

  return {
    inputRef,
    importing,
    error,
    driveStatus,
    driveSource,
    driveConfigured,
    driveReady,
    openFolderPicker,
    handleFiles,
    loadBundledSample,
    syncDrive,
    libraryActionsReady: libraryReady && !importing,
  }
}
