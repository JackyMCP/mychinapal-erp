import { C } from '../lib/theme'
export default function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: C.white, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: C.navy }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}
