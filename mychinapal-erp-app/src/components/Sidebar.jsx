import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ width: collapsed ? 58 : 214, transition: 'width .15s ease', background: C.navy, color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: '100vh' }}>
      <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${C.blue},${C.blue3})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>MC</div>
        {!collapsed && <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>My<span style={{ color: C.blue3 }}>China</span>Pal</div>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {MODULES.map(m => (
          <NavLink key={m.path} to={m.path} end={m.end}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 9px', borderRadius: 7, textDecoration: 'none',
              marginBottom: 2, background: isActive ? 'rgba(37,99,235,.28)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,.62)', fontSize: 11.5, fontWeight: isActive ? 700 : 500,
            })}>
            <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
            {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>}
          </NavLink>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 10.5 }}>
        {!collapsed && profile && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>{profile.full_name}</div>
            <div style={{ color: 'rgba(255,255,255,.5)' }}>{profile.role === 'zarzad' ? 'Zarząd' : 'Pracownik'}</div>
          </div>
        )}
        <div onClick={signOut} style={{ cursor: 'pointer', color: 'rgba(255,255,255,.6)' }}>Wyloguj</div>
        <div onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer', color: 'rgba(255,255,255,.4)', marginTop: 6 }}>{collapsed ? '»' : '« Zwiń'}</div>
      </div>
    </div>
  )
}
