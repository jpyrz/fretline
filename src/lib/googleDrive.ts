import { importCloneHeroFolder } from './songImport'
import type { LocalSong } from '../types/game'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API_ROOT = 'https://www.googleapis.com/drive/v3'
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const SOURCE_STORAGE_KEY = 'fretline:google-drive-source'
const SOURCE_SCOPE_VERSION = 2
const CHART_IMPORT_VERSION = 3
const MAX_DRIVE_ITEMS = 5000
const AUDIO_EXTENSIONS = /\.(ogg|mp3|wav|m4a|aac|opus|webm)$/i
const PREVIEW_AUDIO = /^preview\.[^.]+$/i
const CHART_EXTENSION = /\.(chart|mid)$/i
const METADATA_FILE = /^song\.ini$/i
const ARTWORK_FILE = /^(album|cover)\.(png|jpe?g|webp)$/i

interface GoogleDriveConfig {
  clientId: string
  apiKey: string
  appId: string
}

export interface DriveLibrarySource {
  id: string
  name: string
  scopeVersion: 2
}

export interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
}

interface DriveDirectory {
  id: string
  name: string
  path: string
  files: DriveFileMetadata[]
}

interface DriveListResponse {
  nextPageToken?: string
  files?: DriveFileMetadata[]
}

interface PickerDocument {
  id?: string
  name?: string
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
      ViewId: {
        FOLDERS: string
      }
      DocsView: new (viewId: string) => {
        setIncludeFolders: (include: boolean) => unknown
        setSelectFolderEnabled: (enabled: boolean) => unknown
      }
      PickerBuilder: new () => {
        addView: (view: unknown) => unknown
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
  phase: 'scanning' | 'downloading'
  message: string
}

export interface DriveSyncResult {
  songs: LocalSong[]
  discovered: number
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

export function loadDriveLibrarySource(): DriveLibrarySource | null {
  try {
    const stored = localStorage.getItem(SOURCE_STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<DriveLibrarySource>
    return (
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      value.scopeVersion === SOURCE_SCOPE_VERSION
    )
      ? { id: value.id, name: value.name, scopeVersion: 2 }
      : null
  } catch {
    return null
  }
}

export function saveDriveLibrarySource(source: DriveLibrarySource): void {
  localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(source))
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

async function pickFolder(
  googleWindow: GoogleApiWindow,
  config: GoogleDriveConfig,
  accessToken: string,
): Promise<DriveLibrarySource | null> {
  const picker = googleWindow.google?.picker
  if (!picker) throw new Error('Google Drive Picker is unavailable.')

  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
      view.setIncludeFolders(true)
      view.setSelectFolderEnabled(true)

      const builder = new picker.PickerBuilder()
      builder.addView(view)
      builder.setAppId(config.appId)
      builder.setDeveloperKey(config.apiKey)
      builder.setOAuthToken(accessToken)
      builder.setOrigin(window.location.origin)
      builder.setTitle('Choose the Drive folder containing your song folders')
      builder.setCallback((data) => {
        if (data.action === picker.Action.CANCEL) {
          resolve(null)
          return
        }
        if (data.action !== picker.Action.PICKED) return

        const selected = data.docs?.[0]
        if (!selected?.id) {
          reject(new Error('Google Drive did not return a folder.'))
          return
        }
        resolve({
          id: selected.id,
          name: selected.name || 'Google Drive charts',
          scopeVersion: 2,
        })
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
  source: DriveLibrarySource | null
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
  const source = await pickFolder(googleWindow, config, accessToken)
  return { source, accessToken }
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
          ? 'Google Drive access expired or this folder is no longer available.'
          : `Google Drive returned ${response.status}.`),
    )
  }
  return response.json() as Promise<T>
}

async function listChildren(
  accessToken: string,
  folderId: string,
): Promise<DriveFileMetadata[]> {
  const files: DriveFileMetadata[] = []
  let pageToken = ''

  do {
    const parameters = new URLSearchParams({
      q: `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) parameters.set('pageToken', pageToken)
    const page = await driveRequest<DriveListResponse>(
      accessToken,
      `/files?${parameters}`,
    )
    files.push(...(page.files ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)

  return files
}

async function scanDriveTree(
  accessToken: string,
  root: DriveLibrarySource,
  onProgress?: (progress: DriveSyncProgress) => void,
): Promise<DriveDirectory[]> {
  const queue: DriveDirectory[] = [
    { id: root.id, name: root.name, path: root.name, files: [] },
  ]
  const directories: DriveDirectory[] = []
  let itemCount = 0

  while (queue.length > 0) {
    const directory = queue.shift()
    if (!directory) break
    onProgress?.({
      phase: 'scanning',
      message: `Scanning ${directory.path}…`,
    })
    const children = await listChildren(accessToken, directory.id)
    itemCount += children.length
    if (itemCount > MAX_DRIVE_ITEMS) {
      throw new Error(
        `This Drive folder contains more than ${MAX_DRIVE_ITEMS.toLocaleString()} items. Choose a smaller charts folder.`,
      )
    }

    directory.files = children.filter(
      (child) => child.mimeType !== DRIVE_FOLDER_MIME_TYPE,
    )
    directories.push(directory)
    for (const child of children) {
      if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue
      queue.push({
        id: child.id,
        name: child.name,
        path: `${directory.path}/${child.name}`,
        files: [],
      })
    }
  }

  return directories
}

function isSongFile(file: DriveFileMetadata): boolean {
  return (
    CHART_EXTENSION.test(file.name) ||
    AUDIO_EXTENSIONS.test(file.name) ||
    METADATA_FILE.test(file.name) ||
    ARTWORK_FILE.test(file.name)
  )
}

export function createDriveFingerprint(
  files: DriveFileMetadata[],
): string {
  const fileFingerprint = files
    .filter(isSongFile)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (file) =>
        `${file.id}:${file.modifiedTime ?? ''}:${file.size ?? ''}`,
    )
    .join('|')
  return `chart-import-v${CHART_IMPORT_VERSION}|${fileFingerprint}`
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

export async function syncGoogleDriveLibrary(
  source: DriveLibrarySource,
  accessToken: string,
  existingSongs: LocalSong[],
  onProgress?: (progress: DriveSyncProgress) => void,
): Promise<DriveSyncResult> {
  const directories = await scanDriveTree(accessToken, source, onProgress)
  const songDirectories = directories.filter((directory) => {
    const hasChart = directory.files.some((file) =>
      CHART_EXTENSION.test(file.name),
    )
    const hasAudio = directory.files.some((file) =>
      AUDIO_EXTENSIONS.test(file.name) &&
      !PREVIEW_AUDIO.test(file.name),
    )
    return hasChart && hasAudio
  })
  const songs: LocalSong[] = []
  let unchanged = 0
  let requiredBytes = 0

  for (const directory of songDirectories) {
    const songFiles = directory.files.filter(isSongFile)
    const fingerprint = createDriveFingerprint(songFiles)
    const existing = existingSongs.some(
      (song) =>
        song.source?.type === 'google-drive' &&
        song.source.folderId === directory.id &&
        song.source.fingerprint === fingerprint,
    )
    if (!existing) {
      requiredBytes += songFiles.reduce(
        (total, file) => total + Number(file.size ?? 0),
        0,
      )
    }
  }

  if (requiredBytes > 0 && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    const available =
      estimate.quota !== undefined
        ? estimate.quota - (estimate.usage ?? 0)
        : undefined
    if (available !== undefined && requiredBytes > available * 0.9) {
      throw new Error(
        `These songs need about ${formatBytes(requiredBytes)}, but this browser has only about ${formatBytes(available)} available.`,
      )
    }
    await navigator.storage.persist?.()
  }

  for (const [index, directory] of songDirectories.entries()) {
    const songFiles = directory.files.filter(isSongFile)
    const fingerprint = createDriveFingerprint(songFiles)
    const existing = existingSongs.find(
      (song) =>
        song.source?.type === 'google-drive' &&
        song.source.folderId === directory.id &&
        song.source.fingerprint === fingerprint,
    )
    if (existing) {
      unchanged += 1
      continue
    }

    onProgress?.({
      phase: 'downloading',
      message: `Downloading ${directory.name} (${index + 1} of ${songDirectories.length})…`,
    })
    const files: File[] = []
    for (const file of songFiles) {
      files.push(await downloadDriveFile(accessToken, file))
    }
    const imported = await importCloneHeroFolder(files)
    songs.push({
      ...imported,
      id: `google-drive:${directory.id}`,
      folderName: directory.path,
      source: {
        type: 'google-drive',
        rootFolderId: source.id,
        folderId: directory.id,
        fingerprint,
      },
    })
  }

  return {
    songs,
    discovered: songDirectories.length,
    unchanged,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.ceil(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${Math.ceil(bytes / 1024 ** 2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
