import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ProfileProvider } from './features/profiles/ProfileProvider'
import { AppStateProvider } from './state/AppState'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
