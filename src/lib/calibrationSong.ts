import { parseChart } from './chartParser'
import type { LocalSong } from '../types/game'

const resolution = 192
const playableBeats = 20

function buildCalibrationChart(): string {
  const notes: string[] = []

  for (let index = 0; index < playableBeats; index += 1) {
    const tick = index * resolution
    if (index > 0 && index % 8 === 0) {
      notes.push(`  ${tick} = N 0 0`, `  ${tick} = N 4 0`)
    } else {
      notes.push(`  ${tick} = N ${index % 5} 0`)
    }
  }

  return `[Song]
{
  Name = "Timing Lab"
  Artist = "Fretline"
  Charter = "Generated locally"
  Offset = 0
  Resolution = ${resolution}
}
[SyncTrack]
{
  0 = TS 4
  0 = B 60000
}
[Events]
{
  0 = E "section Calibration run"
}
[ExpertSingle]
{
${notes.join('\n')}
}`
}

export const calibrationChartSource = buildCalibrationChart()

const calibrationChart = parseChart(calibrationChartSource)

export const calibrationSong: LocalSong = {
  id: 'fretline-timing-lab',
  kind: 'calibration',
  chart: calibrationChart,
  charts: [calibrationChart],
  audioFiles: [],
}

export function createCalibrationAudio(audioContext: AudioContext): AudioBuffer {
  const bpm = 60
  const beatSeconds = 60 / bpm
  const totalBeats = playableBeats + 2
  const duration = totalBeats * beatSeconds
  const sampleRate = audioContext.sampleRate
  const buffer = audioContext.createBuffer(
    2,
    Math.ceil(duration * sampleRate),
    sampleRate,
  )

  for (let beat = 0; beat < totalBeats; beat += 1) {
    const start = Math.floor(beat * beatSeconds * sampleRate)
    const clickDuration = Math.floor(sampleRate * 0.045)
    const frequency = beat % 4 === 0 ? 1320 : 880

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel)
      for (let index = 0; index < clickDuration; index += 1) {
        const envelope = Math.exp(-index / (sampleRate * 0.009))
        const phase = (index / sampleRate) * Math.PI * 2 * frequency
        data[start + index] += Math.sin(phase) * envelope * 0.34
      }
    }
  }

  return buffer
}

export function createCalibrationSilence(
  audioContext: AudioContext,
): AudioBuffer {
  const duration = playableBeats + 2
  return audioContext.createBuffer(
    2,
    Math.ceil(duration * audioContext.sampleRate),
    audioContext.sampleRate,
  )
}
