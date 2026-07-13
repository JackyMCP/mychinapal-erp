import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { C } from './theme'

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const idRef = useRef(0)

  const pushToast = useCallback((kind, message) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, kind, message, show: false }])
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(t => (t.id === id ? { ...t, show: true } : t)))
      })
    })
    setTimeout(() => {
      setToasts(prev => prev.map(t => (t.id === id ? { ...t, show: false } : t)))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 320)
    }, 3400)
  }, [])

  const toast = {
    success: (msg) => pushToast('ok', msg),
    error: (msg) => pushToast('err', msg),
  }

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve, confirmLabel: opts.confirmLabel || 'Usuń', cancelLabel: opts.cancelLabel || 'Anuluj' })
    })
  }, [])

  const handleConfirm = (val) => {
    confirmState?.resolve(val)
    setConfirmState(null)
  }

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}

      <div style={{ position: 'fixed', bottom: 22, right: 22, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999, maxWidth: 'calc(100vw - 44px)' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: C.navy, color: '#fff', padding: '12px 16px',
            borderRadius: 11, fontSize: 12.5, fontWeight: 600, boxShadow: '0 12px 30px rgba(0,0,0,.25)', minWidth: 240, maxWidth: 380,
            borderLeft: `4px solid ${t.kind === 'ok' ? C.green : C.red}`,
            transform: t.show ? 'translateX(0)' : 'translateX(120%)', opacity: t.show ? 1 : 0,
            transition: 'transform .32s cubic-bezier(.2,.9,.3,1.2), opacity .25s ease',
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{t.kind === 'ok' ? '✅' : '⚠️'}</span>
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
          </div>
        ))}
      </div>

      {confirmState && (
        <div onClick={() => handleConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'uiFadeIn .15s ease' }}>
          <style>{`@keyframes uiFadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes uiPopIn { from { opacity: 0; transform: translateY(-8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 380, maxWidth: '90vw', boxShadow: '0 24px 60px rgba(0,0,0,.3)', animation: 'uiPopIn .18s ease' }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.55, marginBottom: 18, whiteSpace: 'pre-wrap', color: C.text }}>{confirmState.message}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => handleConfirm(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{confirmState.cancelLabel}</button>
              <button onClick={() => handleConfirm(true)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: C.red, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{confirmState.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  )
}

export function useUI() {
  return useContext(UIContext)
}
