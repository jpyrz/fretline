import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ControllerSetup } from '../components/ControllerSetup'
import { KeyboardSetup } from '../components/KeyboardSetup'
import {
  authorizeGoogleDrive,
  connectGoogleDriveFolder,
  isGoogleDriveConfigured,
  syncGoogleDriveVisualAssets,
} from '../lib/googleDrive'
import { createLocalVisualAssets } from '../lib/visualAssets'
import { useAppState } from '../state/AppState'
import type {
  VisualAsset,
  VisualAssetKind,
} from '../types/game'
import styles from './SettingsView.module.scss'

type SettingsSection =
  | 'gameplay'
  | 'audio'
  | 'visuals'
  | 'controller'
  | 'keyboard'

const SECTION_COPY: Record<
  SettingsSection,
  { label: string; title: string; description: string }
> = {
  gameplay: {
    label: 'Gameplay',
    title: 'Timing & highway',
    description:
      'Tune input timing, visual placement, and highway speed for every song.',
  },
  audio: {
    label: 'Audio',
    title: 'Menu audio',
    description:
      'Choose how Fretline behaves when the jukebox starts on the Home screen.',
  },
  visuals: {
    label: 'Visuals',
    title: 'Stage artwork',
    description:
      'Build local or Google Drive pools for custom backgrounds and highways.',
  },
  controller: {
    label: 'Controller',
    title: 'Guitar controller',
    description:
      'Map a browser gamepad or connect directly to a supported USB receiver.',
  },
  keyboard: {
    label: 'Keyboard',
    title: 'Keyboard controls',
    description:
      'Build a key profile that fits this keyboard and avoids blocked combinations.',
  },
}

function ArtworkThumbnail({ asset }: { asset: VisualAsset }) {
  const [source, setSource] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.file)
    setSource(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset.file])

  return source ? <img src={source} alt="" /> : <span aria-hidden="true" />
}

export function SettingsView() {
  const navigate = useNavigate()
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const highwayInputRef = useRef<HTMLInputElement>(null)
  const [section, setSection] = useState<SettingsSection>('gameplay')
  const [artworkStatus, setArtworkStatus] = useState('')
  const [artworkError, setArtworkError] = useState('')
  const {
    calibration,
    setCalibration,
    highwaySettings,
    setHighwaySettings,
    audioSettings,
    setAudioSettings,
    visualAssets,
    visualAssetsReady,
    visualAssetsSaving,
    visualAssetsError,
    addVisualAssets,
    removeVisualAsset,
    visualSettings,
    setVisualSettings,
    controllerMapping,
    setControllerMapping,
    keyboardMapping,
    setKeyboardMapping,
  } = useAppState()
  const activeCopy = SECTION_COPY[section]
  const backgrounds = visualAssets.filter(
    (asset) => asset.kind === 'background',
  )
  const highways = visualAssets.filter(
    (asset) => asset.kind === 'highway',
  )
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
      setArtworkStatus(
        `Added ${assets.length} ${kind === 'highway' ? 'highway' : 'background'} image${assets.length === 1 ? '' : 's'}.`,
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
    <main className={styles.page}>
      <header className={styles.mobileHeader}>
        <button
          type="button"
          data-controller-back
          onClick={() => navigate('/')}
        >
          <span aria-hidden="true">←</span>
          Main menu
        </button>
        <strong>Settings</strong>
      </header>

      <div className={styles.settingsShell}>
        <aside className={styles.categoryPanel}>
          <h1>Settings</h1>
          <nav aria-label="Settings categories">
            {(Object.keys(SECTION_COPY) as SettingsSection[]).map((key) => (
              <button
                type="button"
                key={key}
                data-active={section === key}
                data-controller-default={section === key || undefined}
                onClick={() => setSection(key)}
                onFocus={() => setSection(key)}
              >
                {SECTION_COPY[key].label}
              </button>
            ))}
            <button
              type="button"
              data-controller-back
              onClick={() => navigate('/')}
            >
              Back
            </button>
          </nav>
          <div className={styles.categoryInfo}>
            <span aria-hidden="true">i</span>
            <strong>{activeCopy.title}</strong>
            <p>{activeCopy.description}</p>
          </div>
        </aside>

        <section className={styles.contentPanel}>
          <div className={styles.commandBar}>
            <button type="button" onClick={() => navigate('/')}>
              <i data-color="green" />
              Continue
            </button>
            <button
              type="button"
              data-controller-back
              onClick={() => navigate('/')}
            >
              <i data-color="red" />
              Back
            </button>
          </div>

          <div className={styles.sectionHeading}>
            <p>{activeCopy.label}</p>
            <h2>{activeCopy.title}</h2>
            <span>{activeCopy.description}</span>
          </div>

          {section === 'gameplay' && (
            <div className={styles.settingList}>
              <label className={styles.settingRow}>
                <span>
                  <strong>Input correction</strong>
                  <small>Moves scored strums earlier or later.</small>
                </span>
                <input
                  type="range"
                  min="-200"
                  max="200"
                  step="1"
                  value={calibration.inputOffsetMs}
                  onChange={(event) =>
                    setCalibration({
                      ...calibration,
                      inputOffsetMs: Number(event.target.value),
                    })
                  }
                />
                <output>{calibration.inputOffsetMs} ms</output>
              </label>

              <label className={styles.toggleRow}>
                <span>
                  <strong>Miss feedback</strong>
                  <small>
                    Briefly pulses the missed receptor and shows a small MISS cue.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={highwaySettings.missFeedback}
                  onChange={(event) =>
                    setHighwaySettings({
                      ...highwaySettings,
                      missFeedback: event.target.checked,
                    })
                  }
                />
              </label>

              <label className={styles.settingRow}>
                <span>
                  <strong>Visual correction</strong>
                  <small>Moves notes relative to the hit line.</small>
                </span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={calibration.videoOffsetMs}
                  onChange={(event) =>
                    setCalibration({
                      ...calibration,
                      videoOffsetMs: Number(event.target.value),
                    })
                  }
                />
                <output>{calibration.videoOffsetMs} ms</output>
              </label>

              <label className={styles.settingRow}>
                <span>
                  <strong>Highway speed</strong>
                  <small>Higher values create more space between notes.</small>
                </span>
                <input
                  type="range"
                  min="6"
                  max="18"
                  step="1"
                  value={highwaySettings.noteSpeed}
                  onChange={(event) =>
                    setHighwaySettings({
                      ...highwaySettings,
                      noteSpeed: Number(event.target.value),
                    })
                  }
                />
                <output>{highwaySettings.noteSpeed}</output>
              </label>

              <label className={styles.settingRow}>
                <span>
                  <strong>Highway length</strong>
                  <small>
                    Shorter values bring the horizon closer, like Clone Hero.
                  </small>
                </span>
                <input
                  type="range"
                  min="45"
                  max="100"
                  step="1"
                  value={highwaySettings.length}
                  onChange={(event) =>
                    setHighwaySettings({
                      ...highwaySettings,
                      length: Number(event.target.value),
                    })
                  }
                />
                <output>{highwaySettings.length}%</output>
              </label>

              <div className={styles.savedRow}>
                <span>
                  <strong>Save behavior</strong>
                  <small>Settings are stored only in this browser.</small>
                </span>
                <b>Automatic</b>
              </div>
            </div>
          )}

          {section === 'audio' && (
            <div className={styles.settingList}>
              <label className={styles.toggleRow}>
                <span>
                  <strong>Start Home music muted</strong>
                  <small>
                    The random library song still loads, but stays silent until
                    you turn sound on.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={audioSettings.homeMusicMuted}
                  onChange={(event) =>
                    setAudioSettings({
                      ...audioSettings,
                      homeMusicMuted: event.target.checked,
                    })
                  }
                />
              </label>
              <div className={styles.savedRow}>
                <span>
                  <strong>Current default</strong>
                  <small>You can always toggle sound from the Home screen.</small>
                </span>
                <b>{audioSettings.homeMusicMuted ? 'Muted' : 'Sound on'}</b>
              </div>
            </div>
          )}

          {section === 'visuals' && (
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
                          {kind === 'background'
                            ? 'Backgrounds'
                            : 'Highways'}
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
                          Add a folder of PNG, JPG, or WebP artwork to build
                          this pool.
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
          )}

          {section === 'controller' && (
            <div className={styles.controllerPane}>
              <ControllerSetup
                mapping={controllerMapping}
                onChange={setControllerMapping}
              />
            </div>
          )}

          {section === 'keyboard' && (
            <div className={styles.keyboardPane}>
              <KeyboardSetup
                mapping={keyboardMapping}
                onChange={setKeyboardMapping}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
