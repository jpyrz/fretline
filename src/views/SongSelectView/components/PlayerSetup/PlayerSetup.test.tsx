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
    touchAvailable: true,
    controllerConfigured: false,
    onBack: vi.fn(),
    onReady: vi.fn(),
    onShowInputModes: vi.fn(),
    onShowInstruments: vi.fn(),
    onShowDifficulties: vi.fn(),
    onChooseInputMode: vi.fn(),
    onChooseInstrument: vi.fn(),
    onChooseDifficulty: vi.fn(),
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
})
