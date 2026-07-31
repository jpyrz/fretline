import { parseChart } from './chartParser'
import { parseMidiCharts } from './midiChartParser'
import { parseSongIni } from './songIni'
import type { LocalSong } from '../types/game'

const AUDIO_EXTENSIONS = /\.(ogg|mp3|wav|m4a|aac|opus|webm)$/i
const PREVIEW_AUDIO = /^preview\.[^.]+$/i
const ARTWORK_FILE = /^(album|cover)\.(png|jpe?g|webp)$/i
const STEM_ORDER = [
  'song',
  'guitar',
  'rhythm',
  'bass',
  'keys',
  'vocals',
  'drums',
  'drums_1',
  'drums_2',
  'drums_3',
  'drums_4',
  'crowd',
]

function relativePath(file: File): string {
  return file.webkitRelativePath || file.name
}

function parentPath(file: File): string {
  const path = relativePath(file)
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

function stemRank(file: File): number {
  const base = file.name.replace(/\.[^.]+$/, '').toLowerCase()
  const index = STEM_ORDER.indexOf(base)
  return index === -1 ? STEM_ORDER.length : index
}

export async function importCloneHeroFolder(
  selectedFiles: FileList | File[],
): Promise<LocalSong> {
  const files = Array.from(selectedFiles)
  const chartFile =
    files.find((file) => file.name.toLowerCase() === 'notes.chart') ??
    files.find((file) => file.name.toLowerCase().endsWith('.chart')) ??
    files.find((file) => file.name.toLowerCase() === 'notes.mid') ??
    files.find((file) => file.name.toLowerCase().endsWith('.mid'))

  if (!chartFile) {
    throw new Error('No notes.chart, notes.mid, or other chart file was found.')
  }

  const folder = parentPath(chartFile)
  const folderFiles = files.filter((file) => parentPath(file) === folder)
  const audioFiles = folderFiles
    .filter(
      (file) =>
        AUDIO_EXTENSIONS.test(file.name) &&
        !PREVIEW_AUDIO.test(file.name),
    )
    .sort((a, b) => stemRank(a) - stemRank(b))
  const previewAudioFile = folderFiles.find((file) =>
    PREVIEW_AUDIO.test(file.name),
  )
  const artworkFile = folderFiles.find((file) =>
    ARTWORK_FILE.test(file.name),
  )

  if (audioFiles.length === 0) {
    throw new Error(
      'The chart was found, but its folder does not contain supported audio.',
    )
  }

  const iniFile = folderFiles.find(
    (file) => file.name.toLowerCase() === 'song.ini',
  )
  const iniMetadata = iniFile
    ? parseSongIni(await iniFile.text())
    : undefined
  let charts
  if (chartFile.name.toLowerCase().endsWith('.mid')) {
    charts = parseMidiCharts(await chartFile.arrayBuffer(), iniMetadata)
  } else {
    const chartSource = await chartFile.text()
    const iniDelaySeconds = iniMetadata?.offsetSeconds ?? 0
    const firstChart = parseChart(
      chartSource,
      undefined,
      iniDelaySeconds,
    )
    charts = firstChart.availableTracks.map((trackName) =>
      trackName === firstChart.trackName
        ? firstChart
        : parseChart(chartSource, trackName, iniDelaySeconds),
    )
  }
  const chart = charts[0]

  return {
    id: `${relativePath(chartFile)}:${chartFile.lastModified}`,
    kind: 'folder',
    chart,
    charts,
    audioFiles,
    previewAudioFile,
    previewStartSeconds: iniMetadata?.previewStartSeconds,
    artworkFile,
    folderName: folder || 'Selected folder',
  }
}

export async function loadBundledSong(): Promise<LocalSong> {
  const baseUrl = import.meta.env.BASE_URL
  const root = `${baseUrl}songs/techno-chiptale`
  const [chartResponse, audioResponse] = await Promise.all([
    fetch(`${root}/notes.chart`),
    fetch(`${root}/song.ogg`),
  ])

  if (!chartResponse.ok || !audioResponse.ok) {
    throw new Error('The bundled sample song could not be loaded.')
  }

  const chartFile = new File(
    [await chartResponse.text()],
    'notes.chart',
    { type: 'text/plain', lastModified: 0 },
  )
  const audioFile = new File(
    [await audioResponse.blob()],
    'song.ogg',
    { type: 'audio/ogg', lastModified: 0 },
  )
  const song = await importCloneHeroFolder([chartFile, audioFile])

  return {
    ...song,
    id: 'bundled-techno-chiptale',
    folderName: 'Bundled CC0 sample',
  }
}

export async function decodeAudioFiles(
  audioContext: AudioContext,
  files: File[],
): Promise<AudioBuffer[]> {
  const decoded: AudioBuffer[] = []
  for (const file of files) {
    try {
      decoded.push(await audioContext.decodeAudioData(await file.arrayBuffer()))
    } catch {
      throw new Error(
        `The browser could not decode ${file.name}. Try Chrome/Edge or use OGG, MP3, or WAV audio.`,
      )
    }
  }
  return decoded
}
