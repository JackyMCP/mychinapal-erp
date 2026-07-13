import { useLang } from "../lib/i18n/LanguageContext";
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'

export default function Login() {
  const {
    t
  } = useLang();

  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('Nieprawidłowy e-mail lub hasło.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <form onSubmit={handleSubmit} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 28px', width: 340 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${C.blue},${C.blue3})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: '#fff', fontSize: 12 }}>{t("MC")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: C.navy }}>{t("My")}<span style={{ color: C.blue3 }}>{t("China")}</span>{t("Pal")}</div>
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
