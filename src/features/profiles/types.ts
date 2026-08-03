import type { PlayInputMode } from '../../lib/inputMode'
import type { Difficulty } from '../../lib/trackSelection'

export type AchievementId =
  | 'first-gig'
  | 'first-fc'
  | 'clean-run'
  | 'fully-charged'
  | 'road-tested'
  | 'ten-fcs'

export type AchievementIcon =
  | 'note'
  | 'crown'
  | 'spark'
  | 'star'
  | 'road'
  | 'stack'

export interface AchievementDefinition {
  id: AchievementId
  name: string
  description: string
  icon: AchievementIcon
}

export interface EarnedAchievement {
  achievementId: AchievementId
  earnedAt: number
}

export interface ProfileLifetimeStats {
  songsPlayed: number
  totalScore: number
  notesHit: number
  playTimeSeconds: number
  fullCombos: number
  starPowerActivations: number
}

export interface PlayerProfile {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lifetimeStats: ProfileLifetimeStats
  achievements: EarnedAchievement[]
}

export interface ProfileRunSummary {
  id: string
  profileId: string
  chartKey: string
  songId: string
  songName: string
  artist: string
  trackName: string
  difficulty: Difficulty
  instrumentId: string
  inputMode: PlayInputMode
  handiTapVersion: number | null
  score: number
  accuracy: number
  fullCombo: boolean
  misses: number
  overstrums: number
  bestStreak: number
  hits: number
  rank: 'S' | 'A' | 'B' | 'C' | 'D'
  starPowerActivations: number
  durationSeconds: number
  completedAt: number
}

export type NewProfileRun = Omit<
  ProfileRunSummary,
  'id' | 'profileId' | 'completedAt'
>

export interface ProfileBestScore {
  id: string
  profileId: string
  chartKey: string
  songId: string
  songName: string
  artist: string
  trackName: string
  difficulty: Difficulty
  instrumentId: string
  inputMode: PlayInputMode
  handiTapVersion: number | null
  bestScore: number
  bestAccuracy: number
  fullCombo: boolean
  bestStreak: number
  playCount: number
  lastPlayedAt: number
}

export interface RecordedRunResult {
  profile: PlayerProfile
  run: ProfileRunSummary
  bestScore: ProfileBestScore
  newPersonalBest: boolean
  unlockedAchievements: AchievementDefinition[]
}

export type PlayerSession =
  | { kind: 'none' }
  | { kind: 'guest' }
  | { kind: 'profile'; profileId: string }

export const EMPTY_LIFETIME_STATS: ProfileLifetimeStats = {
  songsPlayed: 0,
  totalScore: 0,
  notesHit: 0,
  playTimeSeconds: 0,
  fullCombos: 0,
  starPowerActivations: 0,
}
