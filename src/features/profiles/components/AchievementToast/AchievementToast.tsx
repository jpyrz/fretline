import { useEffect } from 'react'
import { useProfiles } from '../../ProfileProvider'
import { AchievementGlyph } from '../AchievementGlyph/AchievementGlyph'
import styles from './AchievementToast.module.scss'

const TOAST_DURATION_MS = 5_200

export function AchievementToast() {
  const { achievementQueue, dismissAchievement } = useProfiles()
  const achievement = achievementQueue[0] ?? null

  useEffect(() => {
    if (!achievement) return
    const timeout = window.setTimeout(dismissAchievement, TOAST_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [achievement, dismissAchievement])

  if (!achievement) return null

  return (
    <div className={styles.viewport} aria-live="assertive" aria-atomic="true">
      <div className={styles.toast} key={achievement.id} role="status">
        <div className={styles.medallion}>
          <span className={styles.brandMark} aria-hidden="true">F</span>
          <span className={styles.achievementMark}>
            <AchievementGlyph icon={achievement.icon} />
          </span>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </div>
        <div className={styles.copy}>
          <span>Achievement unlocked</span>
          <strong>{achievement.name}</strong>
          <small>{achievement.description}</small>
        </div>
      </div>
    </div>
  )
}
