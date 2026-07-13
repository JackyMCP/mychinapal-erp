import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './lib/i18n/LanguageContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Klienci from './pages/Klienci'
import Projekty from './pages/Projekty'
import KasaBank from './pages/KasaBank'
import Czat from './pages/Czat'
import ComingSoon from './pages/ComingSoon'
import { C } from './lib/theme'

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>Ładowanie…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function Shell() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kasa" element={<KasaBank />} />
          <Route path="/klienci" element={<Klienci />} />
          <Route path="/projekty" element={<Projekty />} />
          <Route path="/faktury" element={<ComingSoon title="Faktury & Księgowość" />} />
          <Route path="/logistyka" element={<ComingSoon title="Logistyka & Import" />} />
          <Route path="/poczta" element={<ComingSoon title="Poczta" />} />
          <Route path="/czat" element={<Czat />} />
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
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<Protected><Shell /></Protected>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  )
}
