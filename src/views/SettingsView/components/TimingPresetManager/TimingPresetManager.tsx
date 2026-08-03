import { useEffect, useRef, useState } from 'react'
import { OUTPUT_LATENCY_WARNING_THRESHOLD_MS } from '../../../../features/timingPresets/timingPresets'
import type { TimingPreset } from '../../../../features/timingPresets/types'
import styles from './TimingPresetManager.module.scss'

interface TimingPresetManagerProps {
  presets: TimingPreset[]
  activePreset: TimingPreset
  outputLatencyDifferenceMs: number | null
  onActivate: (presetId: string) => void
  onCreate: () => void
  onDuplicate: (presetId: string) => void
  onRename: (presetId: string, name: string) => void
  onDelete: (presetId: string) => void
  onCalibrate: () => void
}

export function TimingPresetManager({
  presets,
  activePreset,
  outputLatencyDifferenceMs,
  onActivate,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onCalibrate,
}: TimingPresetManagerProps) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(activePreset.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(activePreset.name)
    setRenaming(false)
  }, [activePreset.id, activePreset.name])

  useEffect(() => {
    if (renaming) inputRef.current?.focus()
  }, [renaming])

  const saveName = () => {
    onRename(activePreset.id, name)
    setRenaming(false)
  }

  return (
    <section className={styles.card} aria-labelledby="timing-presets-title">
      <div className={styles.heading}>
        <span>
          <strong id="timing-presets-title">Timing preset</strong>
          <small>
            Keep separate timing for speakers, headphones, and TVs on this
            device.
          </small>
        </span>
        <i>Active</i>
      </div>

      <div className={styles.selector}>
        <label htmlFor="timing-preset-select">Current setup</label>
        <select
          id="timing-preset-select"
          data-controller-nav-item
          data-controller-default
          value={activePreset.id}
          onChange={(event) => onActivate(event.target.value)}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <span>
          {activePreset.calibration.audioOffsetMs} audio ·{' '}
          {activePreset.calibration.inputOffsetMs} input ·{' '}
          {activePreset.calibration.videoOffsetMs} visual ms
        </span>
      </div>

      {outputLatencyDifferenceMs !== null &&
        outputLatencyDifferenceMs >= OUTPUT_LATENCY_WARNING_THRESHOLD_MS && (
          <p className={styles.warning} role="status">
            <b>Audio route may have changed.</b> The last output differed from
            this preset by about {outputLatencyDifferenceMs} ms.
          </p>
        )}

      {renaming && (
        <form
          className={styles.rename}
          onSubmit={(event) => {
            event.preventDefault()
            saveName()
          }}
        >
          <label htmlFor="timing-preset-name">Setup name</label>
          <input
            id="timing-preset-name"
            ref={inputRef}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" data-controller-nav-item>
            Save
          </button>
          <button
            type="button"
            data-controller-nav-item
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </form>
      )}

      <div className={styles.actions}>
        <button type="button" data-controller-nav-item onClick={onCreate}>
          New setup
        </button>
        <button
          type="button"
          data-controller-nav-item
          onClick={() => onDuplicate(activePreset.id)}
        >
          Duplicate
        </button>
        <button
          type="button"
          data-controller-nav-item
          onClick={() => setRenaming(true)}
        >
          Rename
        </button>
        <button
          type="button"
          data-controller-nav-item
          disabled={presets.length <= 1}
          onClick={() => onDelete(activePreset.id)}
        >
          Delete
        </button>
        <button
          type="button"
          className={styles.calibrate}
          data-controller-nav-item
          onClick={onCalibrate}
        >
          Calibrate this setup
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
