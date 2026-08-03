import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimingPresetManager } from './TimingPresetManager'

const defaultPreset = {
  id: 'default',
  name: 'Default Setup',
  calibration: {
    modelVersion: 2 as const,
    audioOffsetMs: 0,
    inputOffsetMs: 18,
    videoOffsetMs: -4,
  },
  measuredOutputLatencySeconds: 0.04,
  createdAt: 1,
  updatedAt: 1,
}

const airPodsPreset = {
  ...defaultPreset,
  id: 'airpods',
  name: 'AirPods',
}

afterEach(cleanup)

describe('TimingPresetManager', () => {
  it('switches the active preset and exposes management actions', () => {
    const onActivate = vi.fn()
    const onCreate = vi.fn()
    const onCalibrate = vi.fn()
    render(
      <TimingPresetManager
        presets={[defaultPreset, airPodsPreset]}
        activePreset={defaultPreset}
        outputLatencyDifferenceMs={null}
        onActivate={onActivate}
        onCreate={onCreate}
        onDuplicate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onCalibrate={onCalibrate}
      />,
    )

    fireEvent.change(screen.getByLabelText('Current setup'), {
      target: { value: 'airpods' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'New setup' }))
    fireEvent.click(
      screen.getByRole('button', { name: /Calibrate this setup/i }),
    )
    expect(onActivate).toHaveBeenCalledWith('airpods')
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onCalibrate).toHaveBeenCalledOnce()
  })

  it('renames the active preset and warns about a changed audio route', () => {
    const onRename = vi.fn()
    render(
      <TimingPresetManager
        presets={[defaultPreset]}
        activePreset={defaultPreset}
        outputLatencyDifferenceMs={46}
        onActivate={vi.fn()}
        onCreate={vi.fn()}
        onDuplicate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('46 ms')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Setup name'), {
      target: { value: 'Phone Speakers' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onRename).toHaveBeenCalledWith('default', 'Phone Speakers')
  })
})
