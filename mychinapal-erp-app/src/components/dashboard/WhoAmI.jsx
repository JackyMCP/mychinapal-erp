import { avatarColor, initials } from '../klienci/utils'
import { C } from '../../lib/theme'

export default function WhoAmI({ profile, isZarzad }) {
  if (!profile) return null
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(profile.full_name) }}>{initials(profile.full_name)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800 }}>{profile.full_name}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{profile.email}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 11px', borderRadius: 20, background: isZarzad ? C.plight : C.blight, color: isZarzad ? C.purple : C.blue }}>
        {isZarzad ? 'Zarząd' : 'Pracownik'}
      </span>
    </div>
  )
}
