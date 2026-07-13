import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n/LanguageContext'
import { C } from '../lib/theme'

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}
function isMacSafari() {
  const ua = window.navigator.userAgent
  const isMac = /macintosh|mac os x/i.test(ua) && !isIos()
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|firefox|fxios/i.test(ua)
  return isMac && isSafari
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallAppButton({ collapsed }) {
  const { t } = useLang()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [modal, setModal] = useState(null) // 'ios' | 'mac' | null
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
  const showIos = isIos()
  const showMac = !showIos && isMacSafari()
  if (!deferredPrompt && !showIos && !showMac) return null // brak wsparcia w tej przeglądarce (np. Firefox)

  const handleClick = async () => {
    if (showIos) { setModal('ios'); return }
    if (showMac && !deferredPrompt) { setModal('mac'); return }
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

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 340, color: C.text }}>
            {modal === 'ios' ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, fontFamily: "'Syne',sans-serif" }}>{t('Zainstaluj aplikację na iPhone/iPad')}</div>
                <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                  <li>{t('Stuknij ikonę Udostępnij na dole ekranu w Safari')} <span style={{ fontWeight: 700 }}>⬆️</span></li>
                  <li>{t('Wybierz „Dodaj do ekranu głównego”')}</li>
                  <li>{t('Potwierdź, stukając „Dodaj”')}</li>
                </ol>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, fontFamily: "'Syne',sans-serif" }}>{t('Zainstaluj aplikację na Macu')}</div>
                <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                  <li>{t('W pasku menu Safari na górze ekranu kliknij „Plik”')}</li>
                  <li>{t('Wybierz „Dodaj do Docka”')} <span style={{ color: C.muted }}>({t('albo ikona Udostępnij w pasku Safari → „Dodaj do Docka”')})</span></li>
                  <li>{t('Kliknij „Dodaj” — aplikacja pojawi się w Docku')}</li>
                </ol>
              </>
            )}
            <button onClick={() => setModal(null)} style={{ marginTop: 16, width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t('Rozumiem')}</button>
          </div>
        </div>
      )}
    </>
  )
}
