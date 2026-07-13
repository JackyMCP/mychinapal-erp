import { useState } from 'react'
import { C } from '../../lib/theme'

export default function LoadingButton({ onClick, children, style = {}, disabled, color }) {
  const [state, setState] = useState('idle') // idle | loading | done
  const bg = color || C.blue

  const handleClick = async () => {
    if (state !== 'idle' || disabled) return
    setState('loading')
    try {
      await onClick?.()
      setState('done')
      setTimeout(() => setState('idle'), 1100)
    } catch (e) {
      setState('idle')
    }
  }

  return (
    <button onClick={handleClick} disabled={disabled || state !== 'idle'}
      style={{
        position: 'relative', minWidth: state === 'loading' ? 40 : undefined,
        padding: state === 'loading' ? '10px' : '9px 18px',
        width: state === 'loading' ? 40 : 'auto', borderRadius: state === 'loading' ? 20 : 8,
        border: 'none', background: bg, color: '#fff', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'width .25s ease, border-radius .25s ease, padding .25s ease',
        overflow: 'hidden', opacity: disabled ? .6 : 1, whiteSpace: 'nowrap',
        ...style,
      }}>
      <span style={{ opacity: state === 'idle' ? 1 : 0, transition: 'opacity .12s ease' }}>{children}</span>
      {state === 'loading' && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin360 .6s linear infinite', display: 'block' }} />
        </span>
      )}
      {state === 'done' && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>✓</span>
      )}
    </button>
  )
}
