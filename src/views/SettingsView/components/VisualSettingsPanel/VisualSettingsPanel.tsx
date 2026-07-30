import { useEffect, useRef, useState } from 'react'
import {
  authorizeGoogleDrive,
  connectGoogleDriveFolder,
  isGoogleDriveConfigured,
  syncGoogleDriveVisualAssets,
} from '../../../../lib/googleDrive'
import { createLocalVisualAssets } from '../../../../lib/visualAssets'
import { useAppState } from '../../../../state/AppState'
import type {
  VisualAsset,
  VisualAssetKind,
} from '../../../../types/game'
import styles from '../../SettingsView.module.scss'

function ArtworkThumbnail({ asset }: { asset: VisualAsset }) {
  const [source, setSource] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.file)
    setSource(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset.file])

  return source ? <img src={source} alt="" /> : <span aria-hidden="true" />
}

export function VisualSettingsPanel() {
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const highwayInputRef = useRef<HTMLInputElement>(null)
  const [artworkStatus, setArtworkStatus] = useState('')
  const [artworkError, setArtworkError] = useState('')
  const {
    visualAssets,
    visualAssetsReady,
    visualAssetsSaving,
    visualAssetsError,
    addVisualAssets,
    removeVisualAsset,
    visualSettings,
    setVisualSettings,
  } = useAppState()
  const backgrounds = visualAssets.filter(
    (asset) => asset.kind === 'background',
  )
  const highways = visualAssets.filter((asset) => asset.kind === 'highway')
  const driveConfigured = isGoogleDriveConfigured()

  const importLocalArtwork = async (
    kind: VisualAssetKind,
    fileList: FileList | null,
  ) => {
    if (!fileList) return
    const assets = createLocalVisualAssets([...fileList], kind)
    if (assets.length === 0) {
      setArtworkError('That folder does not contain PNG, JPG, or WebP images.')
      return
    }
    setArtworkError('')
    try {
      await addVisualAssets(assets)
      const assetName = kind === 'highway' ? 'highway' : 'background'
      setArtworkStatus(
        `Added ${assets.length} ${assetName} image${assets.length === 1 ? '' : 's'}.`,
      )
    } catch {
      // App state exposes the durable storage error below.
    }
  }

  const syncDriveArtwork = async (
    kind: VisualAssetKind,
    changeFolder = false,
  ) => {
    setArtworkError('')
    setArtworkStatus('Connecting to Google Drive…')
    try {
      const currentFolder =
        kind === 'background'
          ? visualSettings.backgroundDriveFolder
          : visualSettings.highwayDriveFolder
      const connection =
        changeFolder || !currentFolder
          ? await connectGoogleDriveFolder(
              `Choose your Fretline ${kind === 'highway' ? 'highways' : 'backgrounds'} folder`,
            )
          : {
              source: currentFolder,
              accessToken: await authorizeGoogleDrive(),
            }
      if (!connection.source) {
        setArtworkStatus('')
        return
      }
      const result = await syncGoogleDriveVisualAssets(
        connection.source,
        connection.accessToken,
        kind,
        visualAssets,
        (progress) => setArtworkStatus(progress.message),
      )
      await addVisualAssets(result.assets)
      setVisualSettings({
        ...visualSettings,
        [kind === 'background'
          ? 'backgroundDriveFolder'
          : 'highwayDriveFolder']: connection.source,
      })
      setArtworkStatus(
        `${result.discovered} ${kind === 'highway' ? 'highway' : 'background'} image${result.discovered === 1 ? '' : 's'} ready` +
          (result.unchanged
            ? ` · ${result.unchanged} already current.`
            : '.'),
      )
    } catch (reason) {
      setArtworkStatus('')
      setArtworkError(
        reason instanceof Error
          ? reason.message
          : 'Google Drive artwork could not be synced.',
      )
    }
  }

  return (
    <div className={styles.visualsPane}>
      <input
        ref={backgroundInputRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        // @ts-expect-error Chromium and Safari support directory input.
        webkitdirectory=""
        onChange={(event) => {
          void importLocalArtwork('background', event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={highwayInputRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        // @ts-expect-error Chromium and Safari support directory input.
        webkitdirectory=""
        onChange={(event) => {
          void importLocalArtwork('highway', event.target.files)
          event.target.value = ''
        }}
      />

      {(
        [
          ['background', backgrounds],
          ['highway', highways],
        ] as const
      ).map(([kind, assets]) => {
        const selection =
          kind === 'background'
            ? visualSettings.backgroundSelection
            : visualSettings.highwaySelection
        const folder =
          kind === 'background'
            ? visualSettings.backgroundDriveFolder
            : visualSettings.highwayDriveFolder
        return (
          <section className={styles.assetGroup} key={kind}>
            <div className={styles.assetHeading}>
              <span>
                <strong>
                  {kind === 'background' ? 'Backgrounds' : 'Highways'}
                </strong>
                <small>
                  {assets.length} image{assets.length === 1 ? '' : 's'}
                  {folder ? ` · Drive: ${folder.name}` : ''}
                </small>
              </span>
              <select
                aria-label={`Selected ${kind}`}
                value={selection}
                onChange={(event) =>
                  setVisualSettings({
                    ...visualSettings,
                    [kind === 'background'
                      ? 'backgroundSelection'
                      : 'highwaySelection']: event.target.value,
                  })
                }
              >
                <option value="default">Fretline default</option>
                <option value="random">Random per song</option>
                {assets.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.assetActions}>
              <button
                type="button"
                disabled={visualAssetsSaving || !visualAssetsReady}
                onClick={() =>
                  (kind === 'background'
                    ? backgroundInputRef
                    : highwayInputRef
                  ).current?.click()
                }
              >
                Add local folder
              </button>
              <button
                type="button"
                disabled={
                  visualAssetsSaving ||
                  !visualAssetsReady ||
                  !driveConfigured
                }
                onClick={() => void syncDriveArtwork(kind)}
              >
                {folder ? 'Sync Google Drive' : 'Connect Google Drive'}
              </button>
              {folder && (
                <button
                  type="button"
                  disabled={visualAssetsSaving}
                  onClick={() => void syncDriveArtwork(kind, true)}
                >
                  Change Drive folder
                </button>
              )}
            </div>

            <div className={styles.assetGrid}>
              {assets.slice(0, 12).map((asset) => (
                <article key={asset.id}>
                  <ArtworkThumbnail asset={asset} />
                  <span title={asset.name}>{asset.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${asset.name}`}
                    onClick={() => void removeVisualAsset(asset.id)}
                  >
                    ×
                  </button>
                </article>
              ))}
              {assets.length === 0 && (
                <p>
                  Add a folder of PNG, JPG, or WebP artwork to build this pool.
                </p>
              )}
            </div>
          </section>
        )
      })}

      <label className={styles.settingRow}>
        <span>
          <strong>Background dim</strong>
          <small>Keeps notes readable over bright stage artwork.</small>
        </span>
        <input
          type="range"
          min="0"
          max="90"
          value={visualSettings.backgroundDim}
          onChange={(event) =>
            setVisualSettings({
              ...visualSettings,
              backgroundDim: Number(event.target.value),
            })
          }
        />
        <output>{visualSettings.backgroundDim}%</output>
      </label>

      <label className={styles.settingRow}>
        <span>
          <strong>Highway artwork</strong>
          <small>Blend custom art under lanes, notes, and beat lines.</small>
        </span>
        <input
          type="range"
          min="20"
          max="100"
          value={visualSettings.highwayOpacity}
          onChange={(event) =>
            setVisualSettings({
              ...visualSettings,
              highwayOpacity: Number(event.target.value),
            })
          }
        />
        <output>{visualSettings.highwayOpacity}%</output>
      </label>

      {(artworkStatus ||
        artworkError ||
        visualAssetsError ||
        visualAssetsSaving) && (
        <p
          className={
            artworkError || visualAssetsError
              ? styles.assetError
              : styles.assetStatus
          }
          aria-live="polite"
        >
          {artworkError ||
            visualAssetsError ||
            (visualAssetsSaving
              ? 'Saving artwork to this device…'
              : artworkStatus)}
        </p>
      )}
    </div>
  )
}
