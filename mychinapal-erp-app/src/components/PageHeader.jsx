import { C } from '../lib/theme'
import { useLang } from '../lib/i18n/LanguageContext'

export default function PageHeader({ title, subtitle, right }) {
  const { t } = useLang()
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
  return (
    <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: C.white, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: C.navy }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: !isMac, metaKey: isMac }))}
        title={t('Szybkie wyszukiwanie')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, color: C.muted, cursor: 'pointer' }}>
        🔍 <span>{t('Szukaj…')}</span>
        <kbd style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 6px', fontSize: 9.5, fontFamily: 'inherit' }}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </div>
      {right}
    </div>
  )
}
