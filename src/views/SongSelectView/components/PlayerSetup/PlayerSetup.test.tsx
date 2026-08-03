import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calibrationSong } from '../../../../lib/calibrationSong'
import type {
  InstrumentChoice,
  TrackChoice,
} from '../../../../lib/trackSelection'
import { PlayerSetup } from './PlayerSetup'

vi.mock('../../../../components/AlbumArtwork', () => ({
  AlbumArtwork: () => <div data-testid="album-artwork" />,
}))

afterEach(cleanup)

const track: TrackChoice = {
  chart: calibrationSong.chart,
  difficulty: 'Expert',
  instrumentId: 'Single',
  instrumentLabel: 'Lead Guitar',
}

const instrument: InstrumentChoice = {
  id: 'Single',
  label: 'Lead Guitar',
  tracks: [track],
}

const timingPreset = {
  id: 'default-setup',
  name: 'Default Setup',
  calibration: {
    modelVersion: 2 as const,
    audioOffsetMs: 0,
    inputOffsetMs: 12,
    videoOffsetMs: 0,
  },
  measuredOutputLatencySeconds: null,
  createdAt: 1,
  updatedAt: 1,
}

function renderSetup(
  overrides: Partial<Parameters<typeof PlayerSetup>[0]> = {},
) {
  const props: Parameters<typeof PlayerSetup>[0] = {
    song: calibrationSong,
    step: 'configure',
    previewStatus: 'idle',
    instruments: [instrument],
    selectedInstrument: instrument,
    selectedTrack: track,
    selectedInputMode: 'tap',
    selectedPracticeSpeed: 1,
    selectedPracticeSection: null,
    practiceLoop: false,
    touchAvailable: true,
    controllerConfigured: false,
    timingPresets: [timingPreset],
    activeTimingPreset: timingPreset,
    timingOutputLatencyDifferenceMs: null,
    onBack: vi.fn(),
    onReady: vi.fn(),
    onShowInputModes: vi.fn(),
    onShowInstruments: vi.fn(),
    onShowDifficulties: vi.fn(),
    onShowTimingPresets: vi.fn(),
    onShowPracticeSpeeds: vi.fn(),
    onShowPracticeSections: vi.fn(),
    onChooseInputMode: vi.fn(),
    onChooseInstrument: vi.fn(),
    onChooseDifficulty: vi.fn(),
    onChooseTimingPreset: vi.fn(),
    onChoosePracticeSpeed: vi.fn(),
    onChoosePracticeSection: vi.fn(),
    onPracticeLoopChange: vi.fn(),
    ...overrides,
  }
  render(<PlayerSetup {...props} />)
  return props
}

describe('PlayerSetup input mode selection', () => {
  it('shows the selected controls alongside instrument and difficulty', () => {
    const props = renderSetup()
    fireEvent.click(
      screen.getByRole('button', { name: 'Controls: Tap' }),
    )
    expect(props.onShowInputModes).toHaveBeenCalledOnce()
  })

  it('keeps tap mode unavailable when the device has no touch input', () => {
    renderSetup({
      step: 'input',
      selectedInputMode: 'standard',
      touchAvailable: false,
    })
    expect(
      screen.getByRole('button', { name: /Tap controls/i }),
    ).toBeDisabled()
  })

  it('offers persistent practice-speed choices from player setup', () => {
    const props = renderSetup({ step: 'speed', selectedPracticeSpeed: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: /70% speed/i }))
    expect(props.onChoosePracticeSpeed).toHaveBeenCalledWith(0.7)
  })

  it('switches timing presets from the guitar-friendly inline picker', () => {
    const airPods = { ...timingPreset, id: 'airpods', name: 'AirPods' }
    const props = renderSetup({
      step: 'timing',
      timingPresets: [timingPreset, airPods],
    })
    fireEvent.click(screen.getByRole('button', { name: /AirPods/i }))
    expect(props.onChooseTimingPreset).toHaveBeenCalledWith('airpods')
  })

  it('explains when an older saved chart needs a section rescan', () => {
    const { practiceSections: _sections, ...legacyChart } = track.chart
    const legacyTrack = { ...track, chart: legacyChart }
    const legacyInstrument = { ...instrument, tracks: [legacyTrack] }
    renderSetup({
      instruments: [legacyInstrument],
      selectedInstrument: legacyInstrument,
      selectedTrack: legacyTrack,
    })
    expect(
      screen.getByRole('button', { name: /Resync to scan sections/i }),
    ).toBeDisabled()
  })

  it('offers authored chart sections and a three-count loop toggle', () => {
    const practiceSection = {
      id: '192:verse 2',
      name: 'Verse 2',
      startTimeSeconds: 12,
      endTimeSeconds: 24,
    }
    const sectionTrack = {
      ...track,
      chart: {
        ...track.chart,
        practiceSections: [practiceSection],
      },
    }
    const sectionInstrument = {
      ...instrument,
      tracks: [sectionTrack],
    }
    const props = renderSetup({
      step: 'section',
      instruments: [sectionInstrument],
      selectedInstrument: sectionInstrument,
      selectedTrack: sectionTrack,
      selectedPracticeSection: practiceSection,
      practiceLoop: true,
    })

    fireEvent.click(screen.getByRole('button', { name: /Verse 2/i }))
    expect(props.onChoosePracticeSection).toHaveBeenCalledWith(
      practiceSection,
    )
  })

  it('opens section selection when loop is tapped before choosing a section', () => {
    const practiceSection = {
      id: '192:verse 2',
      name: 'Verse 2',
      startTimeSeconds: 12,
      endTimeSeconds: 24,
    }
    const sectionTrack = {
      ...track,
      chart: {
        ...track.chart,
        practiceSections: [practiceSection],
      },
    }
    const sectionInstrument = {
      ...instrument,
      tracks: [sectionTrack],
    }
    const props = renderSetup({
      instruments: [sectionInstrument],
      selectedInstrument: sectionInstrument,
      selectedTrack: sectionTrack,
    })

    fireEvent.click(screen.getByRole('button', { name: /Loop section/i }))
    expect(props.onShowPracticeSections).toHaveBeenCalledOnce()
  })
})
