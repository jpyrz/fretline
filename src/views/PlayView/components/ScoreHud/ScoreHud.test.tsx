import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionStats } from '../../../../types/game'
import { ScoreHud } from './ScoreHud'

const stats: SessionStats = {
  score: 1234,
  sustainPoints: 0,
  streak: 27,
  bestStreak: 27,
  hits: 27,
  misses: 0,
  overstrums: 0,
  sustainsCompleted: 0,
  sustainsBroken: 0,
  starPowerMeter: 0.75,
  starPowerActive: false,
  starPowerPhrasesHit: 2,
  starPowerPhrasesMissed: 0,
  starPowerActivations: 0,
  lastErrorMs: null,
  records: [],
}

describe('ScoreHud', () => {
  it('shows score details without duplicating the highway star-power meter', () => {
    render(
      <ScoreHud
        stats={stats}
        chartProgress={42}
        multiplier={3}
        paused={false}
        sessionActive={false}
        practiceSpeed={1}
        onTogglePause={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Current score')).toHaveTextContent('01,234')
    expect(screen.getByLabelText('Current score')).toHaveTextContent('Streak 27')
    expect(screen.getByLabelText('Current score')).toHaveTextContent('×3')
    expect(screen.queryByText(/build power|star power|ready/i)).toBeNull()
  })

  it('keeps pause control available during an active session', () => {
    const onTogglePause = vi.fn()

    render(
      <ScoreHud
        stats={stats}
        chartProgress={42}
        multiplier={3}
        paused={false}
        sessionActive
        practiceSpeed={0.5}
        onTogglePause={onTogglePause}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pause song' }))
    expect(onTogglePause).toHaveBeenCalledOnce()
    expect(screen.getByText('Practice 50%')).toBeInTheDocument()
  })
})
