import { AlbumArtwork } from '../../../../components/AlbumArtwork'
import { BackIconButton } from '../../../../components/BackIconButton/BackIconButton'
import type { SongPreviewStatus } from '../../hooks/useSongPreview'
import {
  DIFFICULTIES,
  type InstrumentChoice,
  type TrackChoice,
} from '../../../../lib/trackSelection'
import type { LocalSong, PracticeSection } from '../../../../types/game'
import type { PlayInputMode } from '../../../../lib/inputMode'
import type { TimingPreset } from '../../../../features/timingPresets/types'
import { OUTPUT_LATENCY_WARNING_THRESHOLD_MS } from '../../../../features/timingPresets/timingPresets'
import {
  formatPracticeSpeed,
  PRACTICE_SPEEDS,
  type PracticeSpeed,
} from '../../../../lib/practiceMode'
import styles from '../../SongSelectView.module.scss'

export type SetupStep =
  | 'browse'
  | 'configure'
  | 'input'
  | 'instrument'
  | 'difficulty'
  | 'timing'
  | 'speed'
  | 'section'

interface PlayerSetupProps {
  song: LocalSong
  step: Exclude<SetupStep, 'browse'>
  previewStatus: SongPreviewStatus
  instruments: InstrumentChoice[]
  selectedInstrument: InstrumentChoice | null | undefined
  selectedTrack: TrackChoice | null | undefined
  selectedInputMode: PlayInputMode
  selectedPracticeSpeed: PracticeSpeed
  selectedPracticeSection: PracticeSection | null
  practiceLoop: boolean
  touchAvailable: boolean
  controllerConfigured: boolean
  timingPresets: TimingPreset[]
  activeTimingPreset: TimingPreset
  timingOutputLatencyDifferenceMs: number | null
  onBack: () => void
  onReady: (track: TrackChoice) => void
  onShowInputModes: () => void
  onShowInstruments: () => void
  onShowDifficulties: () => void
  onShowTimingPresets: () => void
  onShowPracticeSpeeds: () => void
  onShowPracticeSections: () => void
  onChooseInputMode: (mode: PlayInputMode) => void
  onChooseInstrument: (instrument: InstrumentChoice) => void
  onChooseDifficulty: (track: TrackChoice) => void
  onChooseTimingPreset: (presetId: string) => void
  onChoosePracticeSpeed: (speed: PracticeSpeed) => void
  onChoosePracticeSection: (section: PracticeSection | null) => void
  onPracticeLoopChange: (enabled: boolean) => void
}

export function PlayerSetup({
  song,
  step,
  previewStatus,
  instruments,
  selectedInstrument,
  selectedTrack,
  selectedInputMode,
  selectedPracticeSpeed,
  selectedPracticeSection,
  practiceLoop,
  touchAvailable,
  controllerConfigured,
  timingPresets,
  activeTimingPreset,
  timingOutputLatencyDifferenceMs,
  onBack,
  onReady,
  onShowInputModes,
  onShowInstruments,
  onShowDifficulties,
  onShowTimingPresets,
  onShowPracticeSpeeds,
  onShowPracticeSections,
  onChooseInputMode,
  onChooseInstrument,
  onChooseDifficulty,
  onChooseTimingPreset,
  onChoosePracticeSpeed,
  onChoosePracticeSection,
  onPracticeLoopChange,
}: PlayerSetupProps) {
  const practiceSections = selectedTrack?.chart.practiceSections
  const sectionScanCurrent = Array.isArray(practiceSections)
  return (
    <main className={styles.setupPage} data-step={step}>
      <div className={styles.setupBackdrop} aria-hidden="true">
        <AlbumArtwork song={song} />
      </div>

      <header className={styles.setupHeader}>
        <BackIconButton
          label={step === 'configure' ? 'Song library' : 'Back'}
          onClick={onBack}
        />
        <div className={styles.setupTitle}>
          <h1>{song.chart.metadata.name}</h1>
          <p>{song.chart.metadata.artist}</p>
          <small data-preview-status={previewStatus}>
            {previewStatus === 'playing'
              ? '● Preview playing'
              : previewStatus === 'loading'
                ? 'Preparing preview…'
                : previewStatus === 'waiting'
                  ? 'Press a key to hear preview'
                  : 'Fretline setlist'}
          </small>
        </div>
        <span className={styles.setupVersion}>Fretline</span>
      </header>

      <section className={styles.playerSetup} aria-label="Player setup">
        <div className={styles.playerCard}>
          <div className={styles.playerName}>Guest</div>
          <div className={styles.playerSummary}>
            <i aria-hidden="true">♬</i>
            <span>
              <strong>{selectedTrack?.difficulty}</strong>
              <small>
                {selectedInstrument?.label}
                {selectedPracticeSpeed < 1
                  ? ` · Practice ${formatPracticeSpeed(selectedPracticeSpeed)}`
                  : ''}
                {selectedPracticeSection
                  ? ` · ${selectedPracticeSection.name}`
                  : ''}
              </small>
            </span>
          </div>

          {step === 'configure' && (
            <div className={styles.playerMenu}>
              <button
                type="button"
                data-controller-nav-item
                data-controller-default
                onClick={() => {
                  if (selectedTrack) onReady(selectedTrack)
                }}
              >
                <span>Ready</span>
                <b aria-hidden="true">→</b>
              </button>
              <button
                type="button"
                data-controller-nav-item
                aria-label={`Controls: ${
                  selectedInputMode === 'tap' ? 'Tap' : 'Standard'
                }`}
                onClick={onShowInputModes}
              >
                <span>Controls</span>
                <strong>
                  {selectedInputMode === 'tap' ? 'Tap' : 'Standard'}
                </strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                onClick={onShowInstruments}
              >
                <span>Instrument</span>
                <strong>{selectedInstrument?.label}</strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                onClick={onShowDifficulties}
              >
                <span>Difficulty</span>
                <strong>{selectedTrack?.difficulty}</strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                onClick={onShowTimingPresets}
              >
                <span>Timing</span>
                <strong>{activeTimingPreset.name}</strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                onClick={onShowPracticeSpeeds}
              >
                <span>Practice speed</span>
                <strong>
                  {selectedPracticeSpeed === 1
                    ? 'Off · 100%'
                    : formatPracticeSpeed(selectedPracticeSpeed)}
                </strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                disabled={!practiceSections?.length}
                onClick={onShowPracticeSections}
              >
                <span>Practice section</span>
                <strong>
                  {!sectionScanCurrent
                    ? 'Resync to scan sections'
                    : practiceSections.length === 0
                      ? 'No chart markers'
                    : selectedPracticeSection?.name ?? 'Full song'}
                </strong>
              </button>
              <button
                type="button"
                data-controller-nav-item
                disabled={!practiceSections?.length}
                aria-pressed={practiceLoop}
                onClick={() => {
                  if (!selectedPracticeSection) {
                    onShowPracticeSections()
                    return
                  }
                  onPracticeLoopChange(!practiceLoop)
                }}
              >
                <span>Loop section</span>
                <strong>
                  {selectedPracticeSection
                    ? practiceLoop
                      ? 'On · 3-count each pass'
                      : 'Off'
                    : 'Choose a section'}
                </strong>
              </button>
              <div className={styles.disabledMenuRow} aria-disabled="true">
                <span>Modifiers</span>
                <strong>None</strong>
              </div>
              {timingOutputLatencyDifferenceMs !== null &&
                timingOutputLatencyDifferenceMs >=
                  OUTPUT_LATENCY_WARNING_THRESHOLD_MS && (
                  <p className={styles.timingWarning} role="status">
                    Audio route changed by about{' '}
                    {timingOutputLatencyDifferenceMs} ms. Check the timing
                    setup before playing.
                  </p>
                )}
            </div>
          )}

          {step === 'input' && (
            <div className={styles.inlinePicker}>
              <p>Controls</p>
              <button
                type="button"
                data-controller-nav-item
                data-controller-default={
                  selectedInputMode === 'standard' || undefined
                }
                data-active={selectedInputMode === 'standard'}
                onClick={() => onChooseInputMode('standard')}
              >
                <span>
                  <strong>Keyboard / guitar</strong>
                  <small>
                    {controllerConfigured
                      ? 'Mapped guitar ready, with keyboard fallback'
                      : 'Use a physical keyboard or mapped guitar'}
                  </small>
                </span>
                <b aria-hidden="true">
                  {selectedInputMode === 'standard' ? '●' : '○'}
                </b>
              </button>
              <button
                type="button"
                disabled={!touchAvailable}
                data-controller-nav-item={touchAvailable || undefined}
                data-controller-default={
                  touchAvailable && selectedInputMode === 'tap'
                    ? true
                    : undefined
                }
                data-active={selectedInputMode === 'tap'}
                onClick={() => onChooseInputMode('tap')}
              >
                <span>
                  <strong>Tap controls · HandiTap</strong>
                  <small>
                    {touchAvailable
                      ? 'Adapts guitar charts for two-thumb play'
                      : 'Available on touchscreen devices'}
                  </small>
                </span>
                <b aria-hidden="true">
                  {selectedInputMode === 'tap' ? '●' : '○'}
                </b>
              </button>
            </div>
          )}

          {step === 'instrument' && (
            <div className={styles.inlinePicker}>
              <p>Instrument</p>
              {instruments.map((instrument) => {
                const active = instrument.id === selectedInstrument?.id
                return (
                  <button
                    type="button"
                    key={instrument.id}
                    data-controller-nav-item
                    data-controller-default={active || undefined}
                    data-active={active}
                    onClick={() => onChooseInstrument(instrument)}
                  >
                    <span>
                      <strong>{instrument.label}</strong>
                      <small>
                        {instrument.tracks.length}{' '}
                        {instrument.tracks.length === 1
                          ? 'difficulty'
                          : 'difficulties'}{' '}
                        charted
                      </small>
                    </span>
                    <b aria-hidden="true">{active ? '●' : '○'}</b>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'difficulty' && selectedInstrument && (
            <div className={styles.inlinePicker}>
              <p>Difficulty</p>
              {DIFFICULTIES.map((difficulty, index) => {
                const track = selectedInstrument.tracks.find(
                  (candidate) => candidate.difficulty === difficulty,
                )
                const active = difficulty === selectedTrack?.difficulty
                return (
                  <button
                    type="button"
                    key={difficulty}
                    disabled={!track}
                    data-controller-nav-item={track ? true : undefined}
                    data-controller-default={
                      track && active ? true : undefined
                    }
                    data-active={active}
                    onClick={() => {
                      if (track) onChooseDifficulty(track)
                    }}
                  >
                    <span>
                      <strong>{difficulty}</strong>
                      <small>
                        {track
                          ? `${track.chart.notes.length.toLocaleString()} notes`
                          : 'Not charted'}
                      </small>
                    </span>
                    <b aria-label={`${index + 1} of 4 intensity`}>
                      {Array.from({ length: 4 }, (_, meterIndex) => (
                        <i
                          key={meterIndex}
                          data-filled={meterIndex <= index}
                        />
                      ))}
                    </b>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'timing' && (
            <div className={styles.inlinePicker}>
              <p>Timing setup</p>
              {timingPresets.map((preset) => {
                const active = preset.id === activeTimingPreset.id
                return (
                  <button
                    type="button"
                    key={preset.id}
                    data-controller-nav-item
                    data-controller-default={active || undefined}
                    data-active={active}
                    onClick={() => onChooseTimingPreset(preset.id)}
                  >
                    <span>
                      <strong>{preset.name}</strong>
                      <small>
                        {preset.calibration.audioOffsetMs} audio ·{' '}
                        {preset.calibration.inputOffsetMs} input ·{' '}
                        {preset.calibration.videoOffsetMs} visual ms
                      </small>
                    </span>
                    <b aria-hidden="true">{active ? '●' : '○'}</b>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'speed' && (
            <div className={styles.inlinePicker}>
              <p>Practice speed</p>
              {PRACTICE_SPEEDS.map((speed) => {
                const active = speed === selectedPracticeSpeed
                return (
                  <button
                    type="button"
                    key={speed}
                    data-controller-nav-item
                    data-controller-default={active || undefined}
                    data-active={active}
                    onClick={() => onChoosePracticeSpeed(speed)}
                  >
                    <span>
                      <strong>
                        {speed === 1
                          ? 'Full speed'
                          : `${formatPracticeSpeed(speed)} speed`}
                      </strong>
                      <small>
                        {speed === 1
                          ? 'Quick Play timing'
                          : 'Practice run · results are marked separately'}
                      </small>
                    </span>
                    <b aria-hidden="true">{active ? '●' : '○'}</b>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'section' && (
            <div className={styles.inlinePicker}>
              <p>Practice section</p>
              <button
                type="button"
                data-controller-nav-item
                data-controller-default={!selectedPracticeSection || undefined}
                data-active={!selectedPracticeSection}
                onClick={() => onChoosePracticeSection(null)}
              >
                <span>
                  <strong>Full song</strong>
                  <small>Play from beginning to end</small>
                </span>
                <b aria-hidden="true">{selectedPracticeSection ? '○' : '●'}</b>
              </button>
              {(practiceSections ?? []).map((section) => {
                const active = section.id === selectedPracticeSection?.id
                return (
                  <button
                    type="button"
                    key={section.id}
                    data-controller-nav-item
                    data-controller-default={active || undefined}
                    data-active={active}
                    onClick={() => onChoosePracticeSection(section)}
                  >
                    <span>
                      <strong>{section.name}</strong>
                      <small>
                        {Math.max(
                          1,
                          Math.round(
                            section.endTimeSeconds - section.startTimeSeconds,
                          ),
                        )}{' '}
                        second section
                      </small>
                    </span>
                    <b aria-hidden="true">{active ? '●' : '○'}</b>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <footer className={styles.setupControls}>
        <span>
          <i data-color="green" /> Select
        </span>
        <span>
          <i data-color="red" /> Back
        </span>
        <span>
          <b>{selectedInputMode === 'tap' ? '☝' : '↕'}</b>{' '}
          {selectedInputMode === 'tap'
            ? 'Tap to navigate'
            : 'Strum to navigate'}
        </span>
      </footer>
    </main>
  )
}
