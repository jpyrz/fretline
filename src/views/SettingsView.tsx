import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ControllerSetup } from '../components/ControllerSetup'
import { KeyboardSetup } from '../components/KeyboardSetup'
import { useAppState } from '../state/AppState'
import styles from './SettingsView.module.scss'

type SettingsSection = 'gameplay' | 'controller' | 'keyboard'

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
  const [section, setSection] = useState<SettingsSection>('gameplay')
  const {
    calibration,
    setCalibration,
    highwaySettings,
    setHighwaySettings,
    controllerMapping,
    setControllerMapping,
    keyboardMapping,
    setKeyboardMapping,
  } = useAppState()
  const activeCopy = SECTION_COPY[section]

  return (
    <main className={styles.page}>
      <header className={styles.mobileHeader}>
        <button
          type="button"
          data-controller-back
          onClick={() => navigate('/')}
        >
          <span aria-hidden="true">←</span>
          Main menu
        </button>
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
              <label className={styles.settingRow}>
                <span>
                  <strong>Input correction</strong>
                  <small>Moves scored strums earlier or later.</small>
                </span>
                <input
                  type="range"
                  min="-200"
                  max="200"
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

              <label className={styles.settingRow}>
                <span>
                  <strong>Visual correction</strong>
                  <small>Moves notes relative to the hit line.</small>
                </span>
                <input
                  type="range"
                  min="-100"
                  max="100"
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
