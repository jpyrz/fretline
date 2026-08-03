import { lazy, Suspense, type ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MenuControllerNavigation } from './components/MenuControllerNavigation'
import { AchievementToast } from './features/profiles/components/AchievementToast/AchievementToast'
import { ProfilePicker } from './features/profiles/components/ProfilePicker/ProfilePicker'
import { useProfiles } from './features/profiles/ProfileProvider'
import { HomeView } from './views/HomeView'

const PlayView = lazy(() =>
  import('./views/PlayView').then((module) => ({
    default: module.PlayView,
  })),
)
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((module) => ({
    default: module.SettingsView,
  })),
)
const SongSelectView = lazy(() =>
  import('./views/SongSelectView').then((module) => ({
    default: module.SongSelectView,
  })),
)
const ProfileView = lazy(() =>
  import('./views/ProfileView').then((module) => ({
    default: module.ProfileView,
  })),
)

function RequirePlayer({ children }: { children: ReactElement }) {
  const { session, profilesReady } = useProfiles()
  if (!profilesReady) {
    return (
      <div className="route-loading" role="status">
        Loading players…
      </div>
    )
  }
  return session.kind === 'none' ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <>
      <MenuControllerNavigation />
      <ProfilePicker />
      <AchievementToast />
      <Suspense
        fallback={
          <div className="route-loading" role="status">
            Loading stage…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route
            path="/songs"
            element={
              <RequirePlayer>
                <SongSelectView />
              </RequirePlayer>
            }
          />
          <Route path="/settings" element={<SettingsView />} />
          <Route
            path="/profile"
            element={
              <RequirePlayer>
                <ProfileView />
              </RequirePlayer>
            }
          />
          <Route
            path="/play"
            element={
              <RequirePlayer>
                <PlayView />
              </RequirePlayer>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
