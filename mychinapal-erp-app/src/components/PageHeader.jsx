import { C } from '../lib/theme'
import { useLang } from '../lib/i18n/LanguageContext'
import useIsMobile from '../lib/useIsMobile'

export default function PageHeader({ title, subtitle, right }) {
  const { t } = useLang()
  const isMobile = useIsMobile()
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
  return (
    <div style={{
      padding: isMobile ? '12px 16px' : '16px 22px', borderBottom: `1px solid ${C.border}`, background: C.white,
      display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: isMobile ? 15 : 16, fontWeight: 800, color: C.navy }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: !isMac, metaKey: isMac }))}
        title={t('Szukaj we wszystkim: klienci, zamówienia, dokumenty, zadania, wiadomości, towary — PL i 中文')}
        className="global-search-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '9px 14px' : '11px 18px', borderRadius: 11,
          border: `1.5px solid ${C.bmid}`, background: `linear-gradient(120deg, ${C.blight}, #fff)`,
          fontSize: 13, fontWeight: 600, color: C.blue, cursor: 'pointer', minWidth: isMobile ? 0 : 260,
          width: isMobile ? '100%' : undefined, boxSizing: 'border-box',
          boxShadow: '0 2px 10px rgba(37,99,235,.08)', transition: 'box-shadow .18s ease, transform .18s ease, border-color .18s ease',
        }}>
        <span style={{ fontSize: 16 }}>🔍</span>
        <span style={{ flex: 1, color: C.text2, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('Szukaj wszystkiego…')}</span>
        {!isMobile && <kbd style={{ background: '#fff', border: `1px solid ${C.bmid}`, color: C.blue, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit' }}>{isMac ? '⌘' : 'Ctrl'} K</kbd>}
      </div>
      <style>{`
        .global-search-trigger:hover { box-shadow: 0 8px 22px rgba(37,99,235,.18); transform: translateY(-1px); border-color: ${C.blue}; }
      `}</style>
      {right && (
        isMobile
          ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>{right}</div>
          : right
      )}
    </div>
  )
}
