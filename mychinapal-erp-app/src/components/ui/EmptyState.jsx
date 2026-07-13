import { C } from '../../lib/theme'

export default function EmptyState({ icon = '📭', title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 14px', borderRadius: 18, background: C.blight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, animation: 'floaty 3s ease-in-out infinite' }}>{icon}</div>
      {title && <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: C.text }}>{title}</div>}
      {subtitle && <div style={{ fontSize: 11, color: C.muted, marginBottom: action ? 14 : 0, lineHeight: 1.5 }}>{subtitle}</div>}
      {action}
    </div>
  )
}
