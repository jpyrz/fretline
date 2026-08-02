import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { calibrationSong } from '../../../../lib/calibrationSong'
import type {
  InstrumentChoice,
  TrackChoice,
} from '../../../../lib/trackSelection'
import { PlayerSetup } from './PlayerSetup'

vi.mock('../../../../components/AlbumArtwork', () => ({
  AlbumArtwork: () => <div data-testid="album-artwork" />,
}))

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
    onBack: vi.fn(),
    onReady: vi.fn(),
    onShowInputModes: vi.fn(),
    onShowInstruments: vi.fn(),
    onShowDifficulties: vi.fn(),
    onShowPracticeSpeeds: vi.fn(),
    onShowPracticeSections: vi.fn(),
    onChooseInputMode: vi.fn(),
    onChooseInstrument: vi.fn(),
    onChooseDifficulty: vi.fn(),
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
})
