import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n/LanguageContext'
import { C } from '../lib/theme'
import { useEffect, useRef, useState } from 'react'
import InstallAppButton from './InstallAppButton'

export const MODULES = [
  { path: '/', label: 'Dashboard', icon: '🏠', end: true },
  { path: '/kasa', label: 'Kasa & Bank', icon: '💰' },
  { path: '/klienci', label: 'Klienci & CRM', icon: '🧑‍💼' },
  { path: '/projekty', label: 'Projekty & Zamówienia', icon: '📦' },
  { path: '/magazyn', label: 'Magazyn', icon: '🗃️' },
  { path: '/faktury', label: 'Faktury & Księgowość', icon: '🧾' },
  { path: '/logistyka', label: 'Logistyka & Import', icon: '🚢' },
  { path: '/poczta', label: 'Poczta', icon: '✉️' },
  { path: '/czat', label: 'Czat wewnętrzny', icon: '💬' },
  { path: '/raporty', label: 'Raporty & Analizy', icon: '📊' },
  { path: '/ustawienia', label: 'Ustawienia', icon: '⚙️' },
]

export const ZARZAD_ONLY_PATHS = ['/kasa', '/faktury']

function isModActive(m, pathname) {
  if (m.end) return pathname === m.path
  return pathname === m.path || pathname.startsWith(m.path + '/')
}

export default function Sidebar() {
  const { profile, signOut, isZarzad } = useAuth()
  const { lang, setLang, t } = useLang()
  const [collapsed, setCollapsed] = useState(false)
  const modules = MODULES.filter(m => isZarzad || !ZARZAD_ONLY_PATHS.includes(m.path))
  const location = useLocation()
  const navRefs = useRef({})
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0 })

  useEffect(() => {
    const activeMod = modules.find(m => isModActive(m, location.pathname))
    const el = activeMod && navRefs.current[activeMod.path]
    if (el) {
      setPill({ top: el.offsetTop, height: el.offsetHeight, opacity: 1 })
    } else {
      setPill(p => ({ ...p, opacity: 0 }))
    }
  }, [location.pathname, collapsed, modules.length])

  return (
    <div style={{ width: collapsed ? 58 : 214, transition: 'width .15s ease', background: C.navy, color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
      <div style={{ padding: collapsed ? '18px 10px 16px' : '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40 }}>
          <div className="logo-type-wrap" style={{ position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
            {collapsed
              ? <img src="/mark-white.png" alt="MyChinaPal" className="logo-type-img" style={{ height: 32, width: 'auto', flexShrink: 0, display: 'block' }} />
              : <img src="/logo-white.png" alt="MyChinaPal" className="logo-type-img" style={{ height: 34, width: 'auto', flexShrink: 0, display: 'block' }} />}
            <div className="logo-type-cursor" />
          </div>
          <style>{`
            @keyframes logoTypeReveal { 0% { clip-path: inset(0 100% 0 0); } 16% { clip-path: inset(0 0% 0 0); } 94% { clip-path: inset(0 0% 0 0); } 100% { clip-path: inset(0 100% 0 0); } }
            @keyframes logoCursorMove { 0% { left: 0%; opacity: 1; } 16% { left: 100%; opacity: 1; } 18% { opacity: 0; } 94% { opacity: 0; } 96% { left: 0%; opacity: 1; } 100% { left: 0%; opacity: 1; } }
            @keyframes logoGlow { 0%,100% { filter: drop-shadow(0 0 0 rgba(59,130,246,0)); } 50% { filter: drop-shadow(0 0 6px rgba(59,130,246,.55)); } }
            .logo-type-img { animation: logoTypeReveal 10s ease-in-out infinite, logoGlow 10s ease-in-out infinite; }
            .logo-type-cursor {
              position: absolute; top: 1px; bottom: 1px; width: 2px; border-radius: 2px;
              background: linear-gradient(180deg, rgba(147,197,253,.95), rgba(59,130,246,.85));
              box-shadow: 0 0 8px rgba(59,130,246,.85);
              animation: logoCursorMove 10s ease-in-out infinite;
            }
          `}</style>
        </div>

        {/* przełącznik języka — zawsze widoczny, tuż pod logo */}
        <div style={{
          display: 'flex', marginTop: 14, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 3,
          gap: 2, justifyContent: collapsed ? 'center' : 'stretch',
        }}>
          <button onClick={() => setLang('pl')} title={t("Polski")} style={{
            flex: collapsed ? 'none' : 1, border: 'none', cursor: 'pointer', padding: collapsed ? '5px 6px' : '5px 0',
            borderRadius: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
            background: lang === 'pl' ? C.blue : 'transparent', color: lang === 'pl' ? '#fff' : 'rgba(255,255,255,.5)',
            transition: 'all .15s ease',
          }}>{collapsed ? '🇵🇱' : t("PL")}</button>
          <button onClick={() => setLang('zh')} title={t("中文")} style={{
            flex: collapsed ? 'none' : 1, border: 'none', cursor: 'pointer', padding: collapsed ? '5px 6px' : '5px 0',
            borderRadius: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
            background: lang === 'zh' ? C.blue : 'transparent', color: lang === 'zh' ? '#fff' : 'rgba(255,255,255,.5)',
            transition: 'all .15s ease',
          }}>{t("中文")}</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 6, right: 6, borderRadius: 7, background: 'linear-gradient(135deg, rgba(37,99,235,.9), rgba(59,130,246,.75))',
          boxShadow: '0 4px 14px rgba(37,99,235,.35)', zIndex: 0, pointerEvents: 'none',
          top: pill.top, height: pill.height, opacity: pill.opacity,
          transition: 'top .28s cubic-bezier(.3,.9,.4,1.1), height .2s ease, opacity .15s ease',
        }} />
        {modules.map(m => (
          <NavLink key={m.path} ref={el => { if (el) navRefs.current[m.path] = el }} to={m.path} end={m.end}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 9px', borderRadius: 7, textDecoration: 'none',
              marginBottom: 2, position: 'relative', zIndex: 1,
              color: isActive ? '#fff' : 'rgba(255,255,255,.62)', fontSize: 11.5, fontWeight: isActive ? 700 : 500,
              transition: 'color .15s ease',
            })}>
            <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
            {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(m.label)}</span>}
          </NavLink>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 10.5 }}>
        <InstallAppButton collapsed={collapsed} />
        {!collapsed && profile && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>{profile.full_name}</div>
            <div style={{ color: 'rgba(255,255,255,.5)' }}>{profile.role === 'zarzad' ? t('Zarząd') : t('Pracownik')}</div>
          </div>
        )}
        <div onClick={signOut} style={{ cursor: 'pointer', color: 'rgba(255,255,255,.6)' }}>{t('Wyloguj')}</div>
        <div onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer', color: 'rgba(255,255,255,.4)', marginTop: 6 }}>{collapsed ? '»' : `« ${t('Zwiń')}`}</div>
      </div>
    </div>
  );
}
