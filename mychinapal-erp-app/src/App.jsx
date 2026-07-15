import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './lib/i18n/LanguageContext'
import { UIProvider } from './lib/ui'
import CommandPalette from './components/CommandPalette'
import GlobalStyles from './components/ui/GlobalStyles'
import Sidebar, { MOBILE_TOPBAR_HEIGHT } from './components/Sidebar'
import SplashScreen from './components/SplashScreen'
import useIsMobile from './lib/useIsMobile'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Klienci from './pages/Klienci'
import Magazyn from './pages/Magazyn'
import Faktury from './pages/Faktury'
import Projekty from './pages/Projekty'
import KasaBank from './pages/KasaBank'
import Czat from './pages/Czat'
import Wyceny from './pages/Wyceny'
import ComingSoon from './pages/ComingSoon'
import MojeProjekty from './pages/MojeProjekty'
import MojeZadania from './pages/MojeZadania'
import { C } from './lib/theme'

function Protected({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>Ładowanie…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

function Shell() {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <CommandPalette />
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? `calc(${MOBILE_TOPBAR_HEIGHT}px + env(safe-area-inset-top))` : 0 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/moje-projekty" element={<MojeProjekty />} />
          <Route path="/moje-zadania" element={<MojeZadania />} />
          <Route path="/kasa" element={<KasaBank />} />
          <Route path="/klienci" element={<Klienci />} />
          <Route path="/projekty" element={<Projekty />} />
          <Route path="/magazyn" element={<Magazyn />} />
          <Route path="/faktury" element={<Faktury />} />
          <Route path="/logistyka" element={<ComingSoon title="Logistyka & Import" />} />
          <Route path="/poczta" element={<ComingSoon title="Poczta" />} />
          <Route path="/czat" element={<Czat />} />
          <Route path="/wyceny" element={<Wyceny />} />
          <Route path="/raporty" element={<ComingSoon title="Raporty & Analizy" />} />
          <Route path="/ustawienia" element={<ComingSoon title="Ustawienia" />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <GlobalStyles />
      <SplashScreen />
      <BrowserRouter>
        <AuthProvider>
          <UIProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={<Protected><Shell /></Protected>} />
            </Routes>
          </UIProvider>
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  )
}
