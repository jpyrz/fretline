import { Navigate, Route, Routes } from 'react-router-dom'
import { HomeView } from './views/HomeView'
import { PlayView } from './views/PlayView'
import { SettingsView } from './views/SettingsView'
import { SongSelectView } from './views/SongSelectView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeView />} />
      <Route path="/songs" element={<SongSelectView />} />
      <Route path="/settings" element={<SettingsView />} />
      <Route path="/play" element={<PlayView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
