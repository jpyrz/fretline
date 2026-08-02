import { useAppState } from '../../../../state/AppState'
import { useSongLibraryActions } from './useSongLibraryActions'
import styles from './LibrarySettingsPanel.module.scss'

export function LibrarySettingsPanel() {
  const {
    songs,
    setSong,
    selectSong,
    addImportedSong,
    libraryReady,
    librarySaving,
    libraryError,
  } = useAppState()
  const playableSongCount = songs.filter(
    (song) => song.kind === 'folder',
  ).length
  const {
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
    libraryActionsReady,
  } = useSongLibraryActions({
    songs,
    libraryReady,
    setSong,
    selectSong,
    addImportedSong,
  })

  return (
    <div className={styles.panel}>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        multiple
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <section className={styles.summary}>
        <span>
          <strong>Song library</strong>
          <small>
            Songs are copied to this browser so network speed never affects
            gameplay timing.
          </small>
        </span>
        <b>{libraryReady ? `${playableSongCount} ready` : 'Loading…'}</b>
      </section>

      <section className={styles.source}>
        <div>
          <strong>Local folders</strong>
          <small>Import an unzipped Clone Hero charts folder from this device.</small>
        </div>
        <button
          type="button"
          disabled={!libraryActionsReady}
          onClick={openFolderPicker}
        >
          Add local folder
        </button>
      </section>

      <section className={styles.source}>
        <div>
          <strong>Google Drive</strong>
          <small>
            {driveSource
              ? `Connected folder: ${driveSource.name}`
              : 'Connect the Drive folder that contains your song folders.'}
          </small>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={
              !libraryActionsReady || !driveConfigured || !driveReady
            }
            onClick={() => void syncDrive(false)}
          >
            {driveSource ? 'Sync now' : 'Connect Drive'}
          </button>
          {driveSource && driveConfigured && (
            <button
              type="button"
              disabled={!libraryActionsReady}
              onClick={() => void syncDrive(true)}
            >
              Change folder
            </button>
          )}
        </div>
      </section>

      <section className={styles.source}>
        <div>
          <strong>Free sample</strong>
          <small>Add the bundled test track if you need something playable.</small>
        </div>
        <button
          type="button"
          disabled={!libraryActionsReady}
          onClick={() => void loadBundledSample()}
        >
          Add sample
        </button>
      </section>

      {(driveStatus || librarySaving || importing) && (
        <p className={styles.status} aria-live="polite">
          {librarySaving
            ? 'Saving songs to this device…'
            : driveStatus || 'Updating library…'}
        </p>
      )}
      {(error || libraryError) && (
        <p className={styles.error}>{error || libraryError}</p>
      )}
    </div>
  )
}
