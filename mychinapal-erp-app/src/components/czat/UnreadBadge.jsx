import { C } from '../../lib/theme'

// Czerwone kółko z liczbą nieprzeczytanych wiadomości — znika samo, gdy count === 0.
export default function UnreadBadge({ count, style }) {
  if (!count) return null
  return (
    <span style={{
      minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9, background: C.red,
      color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, lineHeight: 1, boxShadow: '0 0 0 2px #fff',
      ...style,
    }}>{count > 99 ? '99+' : count}</span>
  )
}
