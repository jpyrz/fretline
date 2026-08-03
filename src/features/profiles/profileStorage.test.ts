import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createStoredProfile,
  loadProfileBestScores,
  loadProfiles,
  recordStoredRun,
} from './profileStorage'
import type { NewProfileRun } from './types'

function testRun(overrides: Partial<NewProfileRun> = {}): NewProfileRun {
  return {
    chartKey: 'song-1|expert|standard',
    songId: 'song-1',
    songName: 'Red Signal',
    artist: 'Fretline',
    trackName: 'ExpertSingle',
    difficulty: 'Expert',
    instrumentId: 'Single',
    inputMode: 'standard',
    handiTapVersion: null,
    score: 50_000,
    accuracy: 100,
    fullCombo: true,
    misses: 0,
    overstrums: 0,
    bestStreak: 200,
    hits: 200,
    rank: 'S',
    starPowerActivations: 1,
    durationSeconds: 180,
    ...overrides,
  }
}

describe('profile storage', () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('fretline-player-profiles')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Profile database is blocked.'))
    })
  })

  it('creates and restores a local profile', async () => {
    const created = await createStoredProfile('  Riff Lord  ')
    const profiles = await loadProfiles()

    expect(created.name).toBe('Riff Lord')
    expect(profiles).toHaveLength(1)
    expect(profiles[0].lifetimeStats.songsPlayed).toBe(0)
  })

  it('updates lifetime stats, achievements, and personal bests atomically', async () => {
    const profile = await createStoredProfile('Nova')
    const first = await recordStoredRun(profile.id, testRun())
    const second = await recordStoredRun(
      profile.id,
      testRun({ score: 40_000, accuracy: 98, fullCombo: false, misses: 2 }),
    )
    const [storedProfile] = await loadProfiles()
    const [best] = await loadProfileBestScores(profile.id)

    expect(first.newPersonalBest).toBe(true)
    expect(first.unlockedAchievements.map((item) => item.id)).toEqual([
      'first-gig',
      'first-fc',
      'clean-run',
      'fully-charged',
    ])
    expect(second.newPersonalBest).toBe(false)
    expect(second.unlockedAchievements).toEqual([])
    expect(storedProfile.lifetimeStats.songsPlayed).toBe(2)
    expect(storedProfile.achievements).toHaveLength(4)
    expect(best.bestScore).toBe(50_000)
    expect(best.fullCombo).toBe(true)
    expect(best.playCount).toBe(2)
  })
})
