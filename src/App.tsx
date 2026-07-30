import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MenuControllerNavigation } from './components/MenuControllerNavigation'
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

export default function App() {
  return (
    <>
      <MenuControllerNavigation />
      <Suspense
        fallback={
          <div className="route-loading" role="status">
            Loading stage…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/songs" element={<SongSelectView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/play" element={<PlayView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
