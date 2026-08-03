import { describe, expect, it } from 'vitest'
import { newlyUnlockedAchievements } from './achievements'
import type { PlayerProfile, ProfileRunSummary } from './types'

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'player-1',
    name: 'Riff',
    createdAt: 1,
    updatedAt: 2,
    lifetimeStats: {
      songsPlayed: 1,
      totalScore: 10_000,
      notesHit: 100,
      playTimeSeconds: 180,
      fullCombos: 1,
      starPowerActivations: 1,
    },
    achievements: [],
    ...overrides,
  }
}

function run(overrides: Partial<ProfileRunSummary> = {}): ProfileRunSummary {
  return {
    id: 'run-1',
    profileId: 'player-1',
    chartKey: 'chart',
    songId: 'song',
    songName: 'Test Song',
    artist: 'Test Artist',
    trackName: 'ExpertSingle',
    difficulty: 'Expert',
    instrumentId: 'Single',
    inputMode: 'standard',
    handiTapVersion: null,
    score: 10_000,
    accuracy: 100,
    fullCombo: true,
    misses: 0,
    overstrums: 0,
    bestStreak: 100,
    hits: 100,
    rank: 'S',
    starPowerActivations: 1,
    durationSeconds: 180,
    completedAt: 2,
    ...overrides,
  }
}

describe('profile achievements', () => {
  it('unlocks run and lifetime milestones together', () => {
    const unlocked = newlyUnlockedAchievements(profile(), run())
    expect(unlocked.map((achievement) => achievement.id)).toEqual([
      'first-gig',
      'first-fc',
      'clean-run',
      'fully-charged',
    ])
  })

  it('does not award an achievement twice', () => {
    const unlocked = newlyUnlockedAchievements(
      profile({
        achievements: [{ achievementId: 'first-gig', earnedAt: 1 }],
      }),
      run({ fullCombo: false, misses: 2, starPowerActivations: 0 }),
    )
    expect(unlocked).toEqual([])
  })

  it('unlocks cumulative road and FC milestones at their thresholds', () => {
    const unlocked = newlyUnlockedAchievements(
      profile({
        lifetimeStats: {
          ...profile().lifetimeStats,
          songsPlayed: 25,
          fullCombos: 10,
        },
        achievements: [
          { achievementId: 'first-gig', earnedAt: 1 },
          { achievementId: 'first-fc', earnedAt: 1 },
          { achievementId: 'clean-run', earnedAt: 1 },
          { achievementId: 'fully-charged', earnedAt: 1 },
        ],
      }),
      run(),
    )
    expect(unlocked.map((achievement) => achievement.id)).toEqual([
      'road-tested',
      'ten-fcs',
    ])
  })
})
