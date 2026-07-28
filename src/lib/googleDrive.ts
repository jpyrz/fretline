import { importCloneHeroFolder } from './songImport'
import type { LocalSong } from '../types/game'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DRIVE_API_ROOT = 'https://www.googleapis.com/drive/v3'
const AUDIO_EXTENSIONS = /\.(ogg|mp3|wav|m4a|aac|opus|webm)$/i
const CHART_EXTENSION = /\.chart$/i

interface GoogleDriveConfig {
  clientId: string
  apiKey: string
  appId: string
}

export interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
}

interface PickerDocument {
  id?: string
  name?: string
  mimeType?: string
}

interface PickerResponse {
  action?: string
  docs?: PickerDocument[]
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleApiWindow extends Window {
  gapi?: {
    load: (
      library: string,
      options:
        | (() => void)
        | {
            callback: () => void
            onerror: () => void
            timeout: number
            ontimeout: () => void
          },
    ) => void
  }
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (response: TokenResponse) => void
          error_callback?: (error: { type?: string }) => void
        }) => {
          requestAccessToken: (options?: { prompt?: string }) => void
        }
      }
    }
    picker: {
      Action: {
        PICKED: string
        CANCEL: string
      }
      DocsViewMode: {
        LIST: string
      }
      Feature: {
        MULTISELECT_ENABLED: string
      }
      ViewId: {
        DOCS: string
      }
      DocsView: new (viewId: string) => {
        setIncludeFolders: (include: boolean) => unknown
        setSelectFolderEnabled: (enabled: boolean) => unknown
        setMode: (mode: string) => unknown
      }
      PickerBuilder: new () => {
        addView: (view: unknown) => unknown
        enableFeature: (feature: string) => unknown
        setAppId: (appId: string) => unknown
        setDeveloperKey: (apiKey: string) => unknown
        setOAuthToken: (token: string) => unknown
        setOrigin: (origin: string) => unknown
        setTitle: (title: string) => unknown
        setCallback: (callback: (data: PickerResponse) => void) => unknown
        build: () => {
          setVisible: (visible: boolean) => void
        }
      }
    }
  }
}

export interface DriveSyncProgress {
  phase: 'checking' | 'downloading'
  message: string
}

export interface DriveImportResult {
  song: LocalSong | null
  unchanged: boolean
}

export interface DriveSyncResult {
  songs: LocalSong[]
  checked: number
  unchanged: number
}

let googleScriptsPromise: Promise<void> | null = null

function getConfig(): GoogleDriveConfig | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY?.trim()
  const appId = import.meta.env.VITE_GOOGLE_APP_ID?.trim()

  return clientId && apiKey && appId ? { clientId, apiKey, appId } : null
}

export function isGoogleDriveConfigured(): boolean {
  return getConfig() !== null
}

function loadScript(id: string, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') {
      resolve()
      return
    }

    const script = existing ?? document.createElement('script')
    script.id = id
    script.src = source
    script.async = true
    script.defer = true
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true'
        resolve()
      },
      { once: true },
    )
    script.addEventListener(
      'error',
      () => reject(new Error('Google sign-in could not be loaded.')),
      { once: true },
    )
    if (!existing) document.head.append(script)
  })
}

async function loadGoogleScripts(): Promise<GoogleApiWindow> {
  if (!googleScriptsPromise) {
    googleScriptsPromise = Promise.all([
      loadScript(
        'fretline-google-identity',
        'https://accounts.google.com/gsi/client',
      ),
      loadScript('fretline-google-api', 'https://apis.google.com/js/api.js'),
    ])
      .then(() => undefined)
      .catch((reason: unknown) => {
        googleScriptsPromise = null
        throw reason
      })
  }

  await googleScriptsPromise
  const googleWindow = window as GoogleApiWindow
  if (!googleWindow.gapi || !googleWindow.google) {
    throw new Error('Google Drive did not finish loading. Please try again.')
  }

  await new Promise<void>((resolve, reject) => {
    googleWindow.gapi?.load('picker', {
      callback: resolve,
      onerror: () => reject(new Error('Google Drive Picker could not load.')),
      timeout: 10_000,
      ontimeout: () =>
        reject(new Error('Google Drive Picker took too long to load.')),
    })
  })

  return googleWindow
}

async function requestDriveToken(
  googleWindow: GoogleApiWindow,
  config: GoogleDriveConfig,
  showConsent: boolean,
): Promise<string> {
  const oauth = googleWindow.google?.accounts.oauth2
  if (!oauth) throw new Error('Google authorization is unavailable.')

  return new Promise((resolve, reject) => {
    const tokenClient = oauth.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token)
          return
        }
        reject(
          new Error(
            response.error_description ??
              response.error ??
              'Google Drive access was not granted.',
          ),
        )
      },
      error_callback: (error) =>
        reject(
          new Error(
            error.type === 'popup_closed'
              ? 'Google Drive sign-in was closed.'
              : 'Google Drive sign-in could not open.',
          ),
        ),
    })
    tokenClient.requestAccessToken({ prompt: showConsent ? 'consent' : '' })
  })
}

export async function prepareGoogleDrive(): Promise<void> {
  if (!getConfig()) return
  await loadGoogleScripts()
}

async function pickSongFiles(
  googleWindow: GoogleApiWindow,
  config: GoogleDriveConfig,
  accessToken: string,
): Promise<PickerDocument[] | null> {
  const picker = googleWindow.google?.picker
  if (!picker) throw new Error('Google Drive Picker is unavailable.')

  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.DOCS)
      view.setIncludeFolders(true)
      view.setSelectFolderEnabled(false)
      view.setMode(picker.DocsViewMode.LIST)

      const builder = new picker.PickerBuilder()
      builder.addView(view)
      builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
      builder.setAppId(config.appId)
      builder.setDeveloperKey(config.apiKey)
      builder.setOAuthToken(accessToken)
      builder.setOrigin(window.location.origin)
      builder.setTitle('Select notes.chart and all audio files for one song')
      builder.setCallback((data) => {
        if (data.action === picker.Action.CANCEL) {
          resolve(null)
          return
        }
        if (data.action !== picker.Action.PICKED) return

        const selected = (data.docs ?? []).filter(
          (document): document is PickerDocument & { id: string } =>
            typeof document.id === 'string',
        )
        if (selected.length === 0) {
          reject(new Error('Google Drive did not return any files.'))
          return
        }
        resolve(selected)
      })
      builder.build().setVisible(true)
    } catch (reason) {
      reject(
        reason instanceof Error
          ? reason
          : new Error('Google Drive Picker could not open.'),
      )
    }
  })
}

export async function connectGoogleDrive(): Promise<{
  files: PickerDocument[] | null
  accessToken: string
}> {
  const config = getConfig()
  if (!config) {
    throw new Error(
      'Google Drive needs a client ID, API key, and app ID before it can connect.',
    )
  }
  const googleWindow = await loadGoogleScripts()
  const accessToken = await requestDriveToken(googleWindow, config, true)
  const files = await pickSongFiles(googleWindow, config, accessToken)
  return { files, accessToken }
}

export async function authorizeGoogleDrive(): Promise<string> {
  const config = getConfig()
  if (!config) {
    throw new Error(
      'Google Drive needs a client ID, API key, and app ID before it can connect.',
    )
  }
  return requestDriveToken(await loadGoogleScripts(), config, false)
}

async function driveRequest<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${DRIVE_API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as {
        error?: { message?: string }
      }
      detail = body.error?.message ?? ''
    } catch {
      // The status message below is still useful when Google returns no JSON.
    }
    throw new Error(
      detail ||
        (response.status === 401 || response.status === 403
          ? 'Google Drive access expired or a selected file is no longer available to Fretline.'
          : `Google Drive returned ${response.status}.`),
    )
  }
  return response.json() as Promise<T>
}

async function getDriveFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const parameters = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size',
    supportsAllDrives: 'true',
  })
  return driveRequest<DriveFileMetadata>(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?${parameters}`,
  )
}

function isSongFile(file: DriveFileMetadata): boolean {
  return CHART_EXTENSION.test(file.name) || AUDIO_EXTENSIONS.test(file.name)
}

export function createDriveFingerprint(
  files: DriveFileMetadata[],
): string {
  return files
    .filter(isSongFile)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (file) =>
        `${file.id}:${file.modifiedTime ?? ''}:${file.size ?? ''}`,
    )
    .join('|')
}

async function downloadDriveFile(
  accessToken: string,
  file: DriveFileMetadata,
): Promise<File> {
  const response = await fetch(
    `${DRIVE_API_ROOT}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!response.ok) {
    throw new Error(`Google Drive could not download ${file.name}.`)
  }
  return new File([await response.blob()], file.name, {
    type: response.headers.get('content-type') || file.mimeType,
    lastModified: file.modifiedTime
      ? new Date(file.modifiedTime).getTime()
      : Date.now(),
  })
}

async function ensureStorageCapacity(files: DriveFileMetadata[]): Promise<void> {
  const requiredBytes = files.reduce(
    (total, file) => total + Number(file.size ?? 0),
    0,
  )
  if (requiredBytes === 0 || !navigator.storage?.estimate) return

  const estimate = await navigator.storage.estimate()
  const available =
    estimate.quota !== undefined
      ? estimate.quota - (estimate.usage ?? 0)
      : undefined
  if (available !== undefined && requiredBytes > available * 0.9) {
    throw new Error(
      `This song needs about ${formatBytes(requiredBytes)}, but this browser has only about ${formatBytes(available)} available.`,
    )
  }
  await navigator.storage.persist?.()
}

async function importDriveFiles(
  metadata: DriveFileMetadata[],
  accessToken: string,
  existingSongs: LocalSong[],
  onProgress?: (progress: DriveSyncProgress) => void,
): Promise<DriveImportResult> {
  const files = metadata.filter(isSongFile)
  const chartFile =
    files.find((file) => file.name.toLowerCase() === 'notes.chart') ??
    files.find((file) => CHART_EXTENSION.test(file.name))
  if (!chartFile) {
    throw new Error(
      'Select notes.chart together with the song audio files. Selecting only the folder does not share its contents with Fretline.',
    )
  }
  if (!files.some((file) => AUDIO_EXTENSIONS.test(file.name))) {
    throw new Error(
      'Select song.ogg, MP3, WAV, or the other audio stems together with notes.chart.',
    )
  }

  const fingerprint = createDriveFingerprint(files)
  const songId = `google-drive:${chartFile.id}`
  const existing = existingSongs.find(
    (song) =>
      song.id === songId &&
      song.source?.type === 'google-drive' &&
      song.source.fingerprint === fingerprint,
  )
  if (existing) return { song: null, unchanged: true }

  await ensureStorageCapacity(files)
  const downloaded: File[] = []
  for (const [index, file] of files.entries()) {
    onProgress?.({
      phase: 'downloading',
      message: `Downloading ${file.name} (${index + 1} of ${files.length})…`,
    })
    downloaded.push(await downloadDriveFile(accessToken, file))
  }

  const imported = await importCloneHeroFolder(downloaded)
  return {
    song: {
      ...imported,
      id: songId,
      folderName: `Google Drive · ${imported.chart.metadata.name}`,
      source: {
        type: 'google-drive',
        fileIds: files.map((file) => file.id),
        fingerprint,
      },
    },
    unchanged: false,
  }
}

export async function importGoogleDriveSelection(
  selected: PickerDocument[],
  accessToken: string,
  existingSongs: LocalSong[],
  onProgress?: (progress: DriveSyncProgress) => void,
): Promise<DriveImportResult> {
  onProgress?.({
    phase: 'checking',
    message: 'Checking the selected Drive files…',
  })
  const metadata = await Promise.all(
    selected
      .filter(
        (document): document is PickerDocument & { id: string } =>
          typeof document.id === 'string',
      )
      .map((document) => getDriveFileMetadata(accessToken, document.id)),
  )
  return importDriveFiles(metadata, accessToken, existingSongs, onProgress)
}

export async function syncGoogleDriveSongs(
  accessToken: string,
  existingSongs: LocalSong[],
  onProgress?: (progress: DriveSyncProgress) => void,
): Promise<DriveSyncResult> {
  const driveSongs = existingSongs.filter(
    (song) =>
      song.source?.type === 'google-drive' &&
      Array.isArray(song.source.fileIds) &&
      song.source.fileIds.length > 0,
  )
  const songs: LocalSong[] = []
  let unchanged = 0

  for (const [index, existing] of driveSongs.entries()) {
    onProgress?.({
      phase: 'checking',
      message: `Checking ${existing.chart.metadata.name} (${index + 1} of ${driveSongs.length})…`,
    })
    const metadata = await Promise.all(
      existing.source?.fileIds.map((fileId) =>
        getDriveFileMetadata(accessToken, fileId),
      ) ?? [],
    )
    const result = await importDriveFiles(
      metadata,
      accessToken,
      existingSongs,
      onProgress,
    )
    if (result.song) songs.push(result.song)
    if (result.unchanged) unchanged += 1
  }

  return {
    songs,
    checked: driveSongs.length,
    unchanged,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.ceil(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${Math.ceil(bytes / 1024 ** 2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
