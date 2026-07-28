import { Navigate, Route, Routes } from 'react-router-dom'
import { HomeView } from './views/HomeView'
import { PlayView } from './views/PlayView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeView />} />
      <Route path="/play" element={<PlayView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
