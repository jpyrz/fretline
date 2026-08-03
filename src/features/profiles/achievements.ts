import type {
  AchievementDefinition,
  AchievementId,
  PlayerProfile,
  ProfileRunSummary,
} from './types'

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-gig',
    name: 'First Gig',
    description: 'Complete your first song.',
    icon: 'note',
  },
  {
    id: 'first-fc',
    name: 'Untouchable',
    description: 'Earn your first Full Combo.',
    icon: 'crown',
  },
  {
    id: 'clean-run',
    name: 'Clean Signal',
    description: 'Finish a song without a miss or overstrum.',
    icon: 'spark',
  },
  {
    id: 'fully-charged',
    name: 'Light the Fuse',
    description: 'Activate Star Power during a song.',
    icon: 'star',
  },
  {
    id: 'road-tested',
    name: 'Road Tested',
    description: 'Complete 25 songs.',
    icon: 'road',
  },
  {
    id: 'ten-fcs',
    name: 'Perfect Ten',
    description: 'Earn 10 Full Combos.',
    icon: 'stack',
  },
] as const

export function achievementById(
  achievementId: AchievementId,
): AchievementDefinition {
  return (
    ACHIEVEMENTS.find((achievement) => achievement.id === achievementId) ??
    ACHIEVEMENTS[0]
  )
}

export function newlyUnlockedAchievements(
  profile: PlayerProfile,
  run: ProfileRunSummary,
): AchievementDefinition[] {
  const earned = new Set(
    profile.achievements.map((achievement) => achievement.achievementId),
  )
  const qualifies = new Set<AchievementId>()

  if (profile.lifetimeStats.songsPlayed >= 1) qualifies.add('first-gig')
  if (run.fullCombo) qualifies.add('first-fc')
  if (run.hits > 0 && run.misses === 0 && run.overstrums === 0) {
    qualifies.add('clean-run')
  }
  if (run.starPowerActivations > 0) qualifies.add('fully-charged')
  if (profile.lifetimeStats.songsPlayed >= 25) qualifies.add('road-tested')
  if (profile.lifetimeStats.fullCombos >= 10) qualifies.add('ten-fcs')

  return ACHIEVEMENTS.filter(
    (achievement) =>
      qualifies.has(achievement.id) && !earned.has(achievement.id),
  )
}
