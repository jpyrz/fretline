import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ControllerSetup } from '../../components/ControllerSetup'
import { KeyboardSetup } from '../../components/KeyboardSetup'
import { BackIconButton } from '../../components/BackIconButton/BackIconButton'
import { useAppState } from '../../state/AppState'
import { VisualSettingsPanel } from './components/VisualSettingsPanel'
import { LibrarySettingsPanel } from './components/LibrarySettingsPanel/LibrarySettingsPanel'
import { TimingPresetManager } from './components/TimingPresetManager'
import styles from './SettingsView.module.scss'

type SettingsSection =
  | 'gameplay'
  | 'audio'
  | 'library'
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
  library: {
    label: 'Library',
    title: 'Song sources',
    description:
      'Import local charts or sync the Google Drive folder that powers Quick Play.',
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

export function SettingsView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const [section, setSection] = useState<SettingsSection>(() =>
    requestedSection && requestedSection in SECTION_COPY
      ? (requestedSection as SettingsSection)
      : 'gameplay',
  )
  const {
    calibration,
    setCalibration,
    timingPresets,
    activeTimingPreset,
    timingOutputLatencyDifferenceMs,
    activateTimingPreset,
    createTimingPreset,
    duplicateTimingPreset,
    renameTimingPreset,
    deleteTimingPreset,
    highwaySettings,
    setHighwaySettings,
    audioSettings,
    setAudioSettings,
    controllerMapping,
    setControllerMapping,
    keyboardMapping,
    setKeyboardMapping,
    useTimingLab: activateTimingLab,
  } = useAppState()
  const activeCopy = SECTION_COPY[section]
  const openTimingLab = () => {
    activateTimingLab()
    navigate('/play')
  }

  return (
    <main className={styles.page}>
      <header className={styles.mobileHeader}>
        <BackIconButton
          label="Main menu"
          onClick={() => navigate('/')}
        />
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
              <TimingPresetManager
                presets={timingPresets}
                activePreset={activeTimingPreset}
                outputLatencyDifferenceMs={timingOutputLatencyDifferenceMs}
                onActivate={activateTimingPreset}
                onCreate={() => createTimingPreset()}
                onDuplicate={duplicateTimingPreset}
                onRename={renameTimingPreset}
                onDelete={deleteTimingPreset}
                onCalibrate={openTimingLab}
              />
              <div className={styles.actionRow}>
                <span>
                  <strong>Timing Lab</strong>
                  <small>
                    Measure visual input timing and audio output timing in one
                    guided two-stage run.
                  </small>
                </span>
                <button type="button" onClick={openTimingLab}>
                  Open Timing Lab
                  <span aria-hidden="true">→</span>
                </button>
              </div>

              <label className={styles.settingRow}>
                <span>
                  <strong>Audio correction</strong>
                  <small>
                    Manually moves song audio. Positive values play it earlier;
                    Timing Lab calculates this automatically.
                  </small>
                </span>
                <input
                  type="range"
                  min="-400"
                  max="400"
                  step="1"
                  value={calibration.audioOffsetMs}
                  onChange={(event) =>
                    setCalibration({
                      ...calibration,
                      audioOffsetMs: Number(event.target.value),
                    })
                  }
                />
                <output>{calibration.audioOffsetMs} ms</output>
              </label>

              <label className={styles.settingRow}>
                <span>
                  <strong>Input correction</strong>
                  <small>
                    Compensates for touch, controller, or keyboard timing.
                    Timing Lab calculates this automatically.
                  </small>
                </span>
                <input
                  type="range"
                  min="-400"
                  max="400"
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
                    Briefly pulses the missed receptor and shows a small MISS
                    cue.
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
                  min="-400"
                  max="400"
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

          {section === 'library' && <LibrarySettingsPanel />}

          {section === 'visuals' && <VisualSettingsPanel />}

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
