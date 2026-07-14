import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'

export default function Login() {
  const {
    t
  } = useLang();

  const { session, loading: authLoading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Naprawa: wcześniej po udanym logowaniu nic się nie działo, dopóki nie
  // odświeżyło się karty ręcznie — sesja aktualizowała się w tle (AuthContext),
  // ale nikt nie przenosił użytkownika z /login dalej. Teraz reagujemy na
  // pojawienie się sesji i przechodzimy od razu do aplikacji.
  useEffect(() => {
    if (!authLoading && session) {
      const dest = location.state?.from?.pathname || '/'
      navigate(dest, { replace: true })
    }
  }, [session, authLoading, navigate, location])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('Nieprawidłowy e-mail lub hasło.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 16, boxSizing: 'border-box' }}>
      <form onSubmit={handleSubmit} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 28px', width: 340, maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <img src="/logo-navy.png" alt="MyChinaPal" style={{ height: 44, width: 'auto' }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t("Zaloguj się")}</div>
        <input type="email" required placeholder={t("E-mail")} value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 10, outline: 'none' }} />
        <input type="password" required placeholder={t("Hasło")} value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 14, outline: 'none' }} />
        {error && <div style={{ color: C.red, fontSize: 11.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? t("Logowanie…") : t("Zaloguj")}
        </button>
      </form>
    </div>
  );
}
