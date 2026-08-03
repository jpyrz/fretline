import { useNavigate } from 'react-router-dom'
import { BackIconButton } from '../../components/BackIconButton/BackIconButton'
import { ACHIEVEMENTS } from '../../features/profiles/achievements'
import { AchievementGlyph } from '../../features/profiles/components/AchievementGlyph/AchievementGlyph'
import { useProfiles } from '../../features/profiles/ProfileProvider'
import styles from './ProfileView.module.scss'

function playTimeLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function ProfileView() {
  const navigate = useNavigate()
  const {
    session,
    activeProfile,
    bestScores,
    openProfilePicker,
    leavePlayer,
  } = useProfiles()

  if (session.kind === 'guest' || !activeProfile) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <BackIconButton label="Main menu" onClick={() => navigate('/')} />
          <div><p>Player profile</p><h1>Guest</h1></div>
        </header>
        <section className={styles.guestCard}>
          <span aria-hidden="true">G</span>
          <h2>Guest session</h2>
          <p>Scores, FCs, and achievements are not saved in Guest Mode.</p>
          <button type="button" onClick={openProfilePicker}>
            Choose or create a profile
          </button>
        </section>
      </main>
    )
  }

  const earnedById = new Map(
    activeProfile.achievements.map((earned) => [
      earned.achievementId,
      earned,
    ]),
  )
  const stats = activeProfile.lifetimeStats

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <BackIconButton label="Main menu" onClick={() => navigate('/')} />
        <div>
          <p>Player profile</p>
          <h1>{activeProfile.name}</h1>
        </div>
        <button type="button" onClick={openProfilePicker}>Switch player</button>
      </header>

      <section className={styles.profileHero}>
        <div className={styles.avatar} aria-hidden="true">
          {activeProfile.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p>Signed in locally</p>
          <h2>{activeProfile.name}</h2>
          <span>{stats.fullCombos} full combos · {activeProfile.achievements.length} achievements</span>
        </div>
      </section>

      <section className={styles.stats} aria-label="Lifetime statistics">
        <article><span>Songs played</span><strong>{stats.songsPlayed}</strong></article>
        <article><span>Total score</span><strong>{stats.totalScore.toLocaleString()}</strong></article>
        <article><span>Notes hit</span><strong>{stats.notesHit.toLocaleString()}</strong></article>
        <article><span>Full combos</span><strong>{stats.fullCombos}</strong></article>
        <article><span>Play time</span><strong>{playTimeLabel(stats.playTimeSeconds)}</strong></article>
        <article><span>Star Power</span><strong>{stats.starPowerActivations}</strong></article>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.achievements}>
          <header>
            <div><p>Milestones</p><h2>Achievements</h2></div>
            <strong>{activeProfile.achievements.length}/{ACHIEVEMENTS.length}</strong>
          </header>
          <div>
            {ACHIEVEMENTS.map((achievement) => {
              const earned = earnedById.get(achievement.id)
              return (
                <article key={achievement.id} data-earned={Boolean(earned)}>
                  <i><AchievementGlyph icon={achievement.icon} /></i>
                  <span>
                    <strong>{achievement.name}</strong>
                    <small>{achievement.description}</small>
                    {earned && (
                      <time dateTime={new Date(earned.earnedAt).toISOString()}>
                        Earned {new Date(earned.earnedAt).toLocaleDateString()}
                      </time>
                    )}
                  </span>
                </article>
              )
            })}
          </div>
        </section>

        <section className={styles.records}>
          <header><p>Personal bests</p><h2>Top records</h2></header>
          <div>
            {bestScores.slice(0, 8).map((score) => (
              <article key={score.id}>
                <span>
                  <strong>{score.songName}</strong>
                  <small>{score.difficulty} · {score.inputMode === 'tap' ? 'HandiTap' : 'Standard'}</small>
                </span>
                <b>{score.bestScore.toLocaleString()}</b>
                {score.fullCombo && <i>FC</i>}
              </article>
            ))}
            {bestScores.length === 0 && (
              <p className={styles.empty}>Complete a song to set your first personal best.</p>
            )}
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => {
            leavePlayer()
            navigate('/')
          }}
        >
          Sign out of this session
        </button>
      </footer>
    </main>
  )
}
