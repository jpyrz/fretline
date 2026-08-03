import { newlyUnlockedAchievements } from './achievements'
import {
  EMPTY_LIFETIME_STATS,
  type NewProfileRun,
  type PlayerProfile,
  type ProfileBestScore,
  type ProfileRunSummary,
  type RecordedRunResult,
} from './types'

const DATABASE_NAME = 'fretline-player-profiles'
const DATABASE_VERSION = 1
const PROFILE_STORE = 'profiles'
const RUN_STORE = 'runs'
const BEST_SCORE_STORE = 'best-scores'

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId
    ? `${prefix}-${randomId}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(
      new Error('This browser cannot save local player profiles.'),
    )
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PROFILE_STORE)) {
        database.createObjectStore(PROFILE_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(RUN_STORE)) {
        const runs = database.createObjectStore(RUN_STORE, { keyPath: 'id' })
        runs.createIndex('profileId', 'profileId')
      }
      if (!database.objectStoreNames.contains(BEST_SCORE_STORE)) {
        const scores = database.createObjectStore(BEST_SCORE_STORE, {
          keyPath: 'id',
        })
        scores.createIndex('profileId', 'profileId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Player profiles could not be opened.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Profile storage failed.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Profile storage was cancelled.'))
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Profile data could not be read.'))
  })
}

export async function loadProfiles(): Promise<PlayerProfile[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(PROFILE_STORE, 'readonly')
    const profiles = await requestValue(
      transaction.objectStore(PROFILE_STORE).getAll() as IDBRequest<
        PlayerProfile[]
      >,
    )
    await transactionComplete(transaction)
    return profiles.sort((left, right) => right.updatedAt - left.updatedAt)
  } finally {
    database.close()
  }
}

export async function createStoredProfile(name: string): Promise<PlayerProfile> {
  const now = Date.now()
  const profile: PlayerProfile = {
    id: createId('player'),
    name: name.trim().slice(0, 24) || 'Player',
    createdAt: now,
    updatedAt: now,
    lifetimeStats: { ...EMPTY_LIFETIME_STATS },
    achievements: [],
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(PROFILE_STORE, 'readwrite')
    transaction.objectStore(PROFILE_STORE).put(profile)
    await transactionComplete(transaction)
    return profile
  } finally {
    database.close()
  }
}

export async function loadProfileBestScores(
  profileId: string,
): Promise<ProfileBestScore[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(BEST_SCORE_STORE, 'readonly')
    const index = transaction.objectStore(BEST_SCORE_STORE).index('profileId')
    const scores = await requestValue(
      index.getAll(IDBKeyRange.only(profileId)) as IDBRequest<
        ProfileBestScore[]
      >,
    )
    await transactionComplete(transaction)
    return scores.sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
  } finally {
    database.close()
  }
}

export async function recordStoredRun(
  profileId: string,
  input: NewProfileRun,
): Promise<RecordedRunResult> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [PROFILE_STORE, RUN_STORE, BEST_SCORE_STORE],
      'readwrite',
    )
    const profileStore = transaction.objectStore(PROFILE_STORE)
    const bestScoreStore = transaction.objectStore(BEST_SCORE_STORE)
    const bestId = `${profileId}|${input.chartKey}`
    const profileRequest = profileStore.get(profileId) as IDBRequest<
      PlayerProfile | undefined
    >
    const bestRequest = bestScoreStore.get(bestId) as IDBRequest<
      ProfileBestScore | undefined
    >
    const [profile, previousBest] = await Promise.all([
      requestValue(profileRequest),
      requestValue(bestRequest),
    ])
    if (!profile) {
      transaction.abort()
      throw new Error('The active player profile no longer exists.')
    }

    const completedAt = Date.now()
    const run: ProfileRunSummary = {
      ...input,
      id: createId('run'),
      profileId,
      completedAt,
    }
    const newPersonalBest = !previousBest || run.score > previousBest.bestScore
    const nextBest: ProfileBestScore = {
      id: bestId,
      profileId,
      chartKey: run.chartKey,
      songId: run.songId,
      songName: run.songName,
      artist: run.artist,
      trackName: run.trackName,
      difficulty: run.difficulty,
      instrumentId: run.instrumentId,
      inputMode: run.inputMode,
      handiTapVersion: run.handiTapVersion,
      bestScore: newPersonalBest ? run.score : previousBest.bestScore,
      bestAccuracy: Math.max(previousBest?.bestAccuracy ?? 0, run.accuracy),
      fullCombo: Boolean(previousBest?.fullCombo || run.fullCombo),
      bestStreak: Math.max(previousBest?.bestStreak ?? 0, run.bestStreak),
      playCount: (previousBest?.playCount ?? 0) + 1,
      lastPlayedAt: completedAt,
    }
    const updatedProfile: PlayerProfile = {
      ...profile,
      updatedAt: completedAt,
      lifetimeStats: {
        songsPlayed: profile.lifetimeStats.songsPlayed + 1,
        totalScore: profile.lifetimeStats.totalScore + run.score,
        notesHit: profile.lifetimeStats.notesHit + run.hits,
        playTimeSeconds:
          profile.lifetimeStats.playTimeSeconds + run.durationSeconds,
        fullCombos:
          profile.lifetimeStats.fullCombos + (run.fullCombo ? 1 : 0),
        starPowerActivations:
          profile.lifetimeStats.starPowerActivations +
          run.starPowerActivations,
      },
    }
    const unlockedAchievements = newlyUnlockedAchievements(
      updatedProfile,
      run,
    )
    updatedProfile.achievements = [
      ...profile.achievements,
      ...unlockedAchievements.map((achievement) => ({
        achievementId: achievement.id,
        earnedAt: completedAt,
      })),
    ]

    profileStore.put(updatedProfile)
    transaction.objectStore(RUN_STORE).put(run)
    bestScoreStore.put(nextBest)
    await transactionComplete(transaction)

    return {
      profile: updatedProfile,
      run,
      bestScore: nextBest,
      newPersonalBest,
      unlockedAchievements,
    }
  } finally {
    database.close()
  }
}
