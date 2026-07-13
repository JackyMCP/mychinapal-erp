import { C } from '../lib/theme'
export default function SectionCard({ title, right, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}
