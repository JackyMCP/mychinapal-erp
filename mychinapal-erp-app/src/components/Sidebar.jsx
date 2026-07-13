import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n/LanguageContext'
import { C } from '../lib/theme'
import { useState } from 'react'

const MODULES = [
  { path: '/', label: 'Dashboard', icon: '🏠', end: true },
  { path: '/kasa', label: 'Kasa & Bank', icon: '💰' },
  { path: '/klienci', label: 'Klienci & CRM', icon: '🧑‍💼' },
  { path: '/projekty', label: 'Projekty & Zamówienia', icon: '📦' },
  { path: '/faktury', label: 'Faktury & Księgowość', icon: '🧾' },
  { path: '/logistyka', label: 'Logistyka & Import', icon: '🚢' },
  { path: '/poczta', label: 'Poczta', icon: '✉️' },
  { path: '/czat', label: 'Czat wewnętrzny', icon: '💬' },
  { path: '/raporty', label: 'Raporty & Analizy', icon: '📊' },
  { path: '/ustawienia', label: 'Ustawienia', icon: '⚙️' },
]

export default function Sidebar() {
  const { profile, signOut, isZarzad } = useAuth()
  const { lang, setLang, t } = useLang()
  const [collapsed, setCollapsed] = useState(false)
  const modules = MODULES.filter(m => isZarzad || m.path !== '/kasa')

  return (
    <div style={{ width: collapsed ? 58 : 214, transition: 'width .15s ease', background: C.navy, color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: '100vh' }}>
      <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${C.blue},${C.blue3})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>MC</div>
          {!collapsed && <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>My<span style={{ color: C.blue3 }}>China</span>Pal</div>}
        </div>

        {/* przełącznik języka — zawsze widoczny, tuż pod logo */}
        <div style={{
          display: 'flex', marginTop: 10, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 3,
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {modules.map(m => (
          <NavLink key={m.path} to={m.path} end={m.end}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 9px', borderRadius: 7, textDecoration: 'none',
              marginBottom: 2, background: isActive ? 'rgba(37,99,235,.28)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,.62)', fontSize: 11.5, fontWeight: isActive ? 700 : 500,
            })}>
            <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
            {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(m.label)}</span>}
          </NavLink>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 10.5 }}>
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
