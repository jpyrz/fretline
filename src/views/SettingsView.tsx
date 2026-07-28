import { useNavigate } from 'react-router-dom'
import { ControllerSetup } from '../components/ControllerSetup'
import { useAppState } from '../state/AppState'
import styles from './SettingsView.module.scss'

export function SettingsView() {
  const navigate = useNavigate()
  const {
    calibration,
    setCalibration,
    highwaySettings,
    setHighwaySettings,
    controllerMapping,
    setControllerMapping,
  } = useAppState()

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate('/')}>
          <span aria-hidden="true">←</span>
          Main menu
        </button>
        <div>
          <p>Fretline</p>
          <strong>Settings</strong>
        </div>
      </header>

      <section className={styles.intro}>
        <p>Gameplay setup</p>
        <h1>Settings</h1>
        <span>Saved automatically on this device.</span>
      </section>

      <div className={styles.settingsGrid}>
        <section className={styles.timingPanel}>
          <div>
            <p>Timing & highway</p>
            <h2>Dial in the feel</h2>
            <span>
              These values affect every song and stay local to this browser.
            </span>
          </div>

          <label>
            <span>
              Input correction
              <strong>{calibration.inputOffsetMs} ms</strong>
            </span>
            <small>Moves scored strums earlier or later.</small>
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
          </label>

          <label>
            <span>
              Visual correction
              <strong>{calibration.videoOffsetMs} ms</strong>
            </span>
            <small>Moves notes relative to the hit line.</small>
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
          </label>

          <label>
            <span>
              Highway speed
              <strong>{highwaySettings.noteSpeed}</strong>
            </span>
            <small>Higher values create more space between notes.</small>
            <input
              type="range"
              min="6"
              max="18"
              step="1"
              value={highwaySettings.noteSpeed}
              onChange={(event) =>
                setHighwaySettings({
                  noteSpeed: Number(event.target.value),
                })
              }
            />
          </label>
        </section>

        <ControllerSetup
          mapping={controllerMapping}
          onChange={setControllerMapping}
        />

        <section className={styles.keyboardPanel}>
          <div>
            <p>Keyboard fallback</p>
            <h2>Hold, then strum</h2>
          </div>
          <div className={styles.keys}>
            {['A', 'S', 'D', 'F', 'G'].map((key, index) => (
              <kbd key={key} data-lane={index}>{key}</kbd>
            ))}
          </div>
          <p>
            Hold the matching fret keys and press <kbd>Space</kbd>,{' '}
            <kbd>Enter</kbd>, or an arrow key to strum.
          </p>
        </section>
      </div>
    </main>
  )
}
