import { AlbumArtwork } from '../../../../components/AlbumArtwork'
import type { SongPreviewStatus } from '../../hooks/useSongPreview'
import {
  DIFFICULTIES,
  type InstrumentChoice,
  type TrackChoice,
} from '../../../../lib/trackSelection'
import type { LocalSong } from '../../../../types/game'
import styles from '../../SongSelectView.module.scss'

export type SetupStep =
  | 'browse'
  | 'configure'
  | 'instrument'
  | 'difficulty'

interface PlayerSetupProps {
  song: LocalSong
  step: Exclude<SetupStep, 'browse'>
  previewStatus: SongPreviewStatus
  instruments: InstrumentChoice[]
  selectedInstrument: InstrumentChoice | null | undefined
  selectedTrack: TrackChoice | null | undefined
  onBack: () => void
  onReady: (track: TrackChoice) => void
  onShowInstruments: () => void
  onShowDifficulties: () => void
  onChooseInstrument: (instrument: InstrumentChoice) => void
  onChooseDifficulty: (track: TrackChoice) => void
}

export function PlayerSetup({
  song,
  step,
  previewStatus,
  instruments,
  selectedInstrument,
  selectedTrack,
  onBack,
  onReady,
  onShowInstruments,
  onShowDifficulties,
  onChooseInstrument,
  onChooseDifficulty,
}: PlayerSetupProps) {
  return (
    <main className={styles.setupPage} data-step={step}>
      <div className={styles.setupBackdrop} aria-hidden="true">
        <AlbumArtwork song={song} />
      </div>

      <header className={styles.setupHeader}>
        <button type="button" data-controller-back onClick={onBack}>
          <span aria-hidden="true">←</span>
          {step === 'configure' ? 'Song library' : 'Back'}
        </button>
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
              <small>{selectedInstrument?.label}</small>
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
              <div className={styles.disabledMenuRow} aria-disabled="true">
                <span>Modifiers</span>
                <strong>None</strong>
              </div>
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
          <b>↕</b> Strum to navigate
        </span>
      </footer>
    </main>
  )
}
