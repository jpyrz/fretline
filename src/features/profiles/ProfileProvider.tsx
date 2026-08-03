/* oxlint-disable react/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createStoredProfile,
  loadProfileBestScores,
  loadProfiles,
  recordStoredRun,
} from './profileStorage'
import type {
  AchievementDefinition,
  NewProfileRun,
  PlayerProfile,
  PlayerSession,
  ProfileBestScore,
  RecordedRunResult,
} from './types'

const LAST_PROFILE_KEY = 'fretline:last-player-profile'

interface ProfileContextValue {
  profiles: PlayerProfile[]
  profilesReady: boolean
  profileError: string
  session: PlayerSession
  activeProfile: PlayerProfile | null
  activePlayerName: string | null
  bestScores: ProfileBestScore[]
  preferredProfileId: string | null
  pickerOpen: boolean
  achievementQueue: AchievementDefinition[]
  openProfilePicker: () => void
  closeProfilePicker: () => void
  selectProfile: (profileId: string) => void
  selectGuest: () => void
  createProfile: (name: string) => Promise<PlayerProfile>
  leavePlayer: () => void
  recordRun: (run: NewProfileRun) => Promise<RecordedRunResult | null>
  dismissAchievement: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function storedPreferredProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY)
  } catch {
    return null
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [profilesReady, setProfilesReady] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [session, setSession] = useState<PlayerSession>({ kind: 'none' })
  const [bestScores, setBestScores] = useState<ProfileBestScore[]>([])
  const [preferredProfileId, setPreferredProfileId] = useState(
    storedPreferredProfileId,
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [achievementQueue, setAchievementQueue] = useState<
    AchievementDefinition[]
  >([])

  useEffect(() => {
    let active = true
    void loadProfiles()
      .then((storedProfiles) => {
        if (active) setProfiles(storedProfiles)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setProfileError(
          reason instanceof Error
            ? reason.message
            : 'Player profiles could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setProfilesReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (session.kind !== 'profile') {
      setBestScores([])
      return
    }
    let active = true
    void loadProfileBestScores(session.profileId)
      .then((scores) => {
        if (active) setBestScores(scores)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setProfileError(
          reason instanceof Error
            ? reason.message
            : 'Personal bests could not be loaded.',
        )
      })
    return () => {
      active = false
    }
  }, [session])

  const activeProfile = useMemo(
    () =>
      session.kind === 'profile'
        ? profiles.find((profile) => profile.id === session.profileId) ?? null
        : null,
    [profiles, session],
  )

  const selectProfile = useCallback((profileId: string) => {
    setSession({ kind: 'profile', profileId })
    setPreferredProfileId(profileId)
    setPickerOpen(false)
    try {
      localStorage.setItem(LAST_PROFILE_KEY, profileId)
    } catch {
      // The profile remains usable for this session in private browsing.
    }
  }, [])

  const selectGuest = useCallback(() => {
    setSession({ kind: 'guest' })
    setPickerOpen(false)
  }, [])

  const openProfilePicker = useCallback(() => setPickerOpen(true), [])
  const closeProfilePicker = useCallback(() => setPickerOpen(false), [])
  const leavePlayer = useCallback(() => {
    setSession({ kind: 'none' })
    setPickerOpen(false)
  }, [])
  const dismissAchievement = useCallback(
    () => setAchievementQueue((current) => current.slice(1)),
    [],
  )

  const createProfile = useCallback(
    async (name: string) => {
      setProfileError('')
      try {
        const profile = await createStoredProfile(name)
        setProfiles((current) => [profile, ...current])
        selectProfile(profile.id)
        return profile
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : 'The new player profile could not be saved.'
        setProfileError(message)
        throw reason
      }
    },
    [selectProfile],
  )

  const recordRun = useCallback(
    async (run: NewProfileRun): Promise<RecordedRunResult | null> => {
      if (session.kind !== 'profile') return null
      setProfileError('')
      try {
        const result = await recordStoredRun(session.profileId, run)
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === result.profile.id ? result.profile : profile,
          ),
        )
        setBestScores((current) => [
          result.bestScore,
          ...current.filter((score) => score.id !== result.bestScore.id),
        ])
        if (result.unlockedAchievements.length > 0) {
          setAchievementQueue((current) => [
            ...current,
            ...result.unlockedAchievements,
          ])
        }
        return result
      } catch (reason) {
        setProfileError(
          reason instanceof Error
            ? reason.message
            : 'This run could not be added to the active profile.',
        )
        return null
      }
    },
    [session],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      profilesReady,
      profileError,
      session,
      activeProfile,
      activePlayerName:
        session.kind === 'guest' ? 'Guest' : activeProfile?.name ?? null,
      bestScores,
      preferredProfileId,
      pickerOpen,
      achievementQueue,
      openProfilePicker,
      closeProfilePicker,
      selectProfile,
      selectGuest,
      createProfile,
      leavePlayer,
      recordRun,
      dismissAchievement,
    }),
    [
      profiles,
      profilesReady,
      profileError,
      session,
      activeProfile,
      bestScores,
      preferredProfileId,
      pickerOpen,
      achievementQueue,
      selectProfile,
      selectGuest,
      createProfile,
      recordRun,
      openProfilePicker,
      closeProfilePicker,
      leavePlayer,
      dismissAchievement,
    ],
  )

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfiles(): ProfileContextValue {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfiles must be used inside ProfileProvider')
  return value
}
