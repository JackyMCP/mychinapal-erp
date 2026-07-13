import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n/LanguageContext'
import { C } from '../lib/theme'

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallAppButton({ collapsed }) {
  const { t } = useLang()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosModal, setShowIosModal] = useState(false)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null
  if (!deferredPrompt && !isIos()) return null

  const handleClick = async () => {
    if (isIos()) { setShowIosModal(true); return }
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <>
      <div onClick={handleClick} title={t('Zainstaluj aplikację')} style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 9px', borderRadius: 7,
        background: 'rgba(37,99,235,.28)', color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 8,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <span style={{ fontSize: 14 }}>📲</span>
        {!collapsed && <span>{t('Zainstaluj aplikację')}</span>}
      </div>

      {showIosModal && (
        <div onClick={() => setShowIosModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 340, color: C.text }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, fontFamily: "'Syne',sans-serif" }}>{t('Zainstaluj aplikację na iPhone/iPad')}</div>
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              <li>{t('Stuknij ikonę Udostępnij na dole ekranu w Safari')} <span style={{ fontWeight: 700 }}>⬆️</span></li>
              <li>{t('Wybierz „Dodaj do ekranu głównego”')}</li>
              <li>{t('Potwierdź, stukając „Dodaj”')}</li>
            </ol>
            <button onClick={() => setShowIosModal(false)} style={{ marginTop: 16, width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t('Rozumiem')}</button>
          </div>
        </div>
      )}
    </>
  )
}
