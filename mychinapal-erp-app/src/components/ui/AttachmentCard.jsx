import { useLang } from "../../lib/i18n/LanguageContext";
import { C } from '../../lib/theme'

// Karta załącznika w czacie (styl znany z WhatsApp/Messenger) — ikona wg typu
// pliku + nazwa + jawne wezwanie do działania "Otwórz w aplikacji", żeby było
// od razu jasne, że kliknięcie pokazuje podgląd W APLIKACJI (patrz
// FilePreviewModal) i NIE trzeba niczego pobierać na dysk tylko po to, żeby
// zobaczyć zawartość.
const EXT_META = {
  pdf: ['📄', C.red, C.rlight],
  xlsx: ['📊', C.green, C.glight], xls: ['📊', C.green, C.glight], xlsm: ['📊', C.green, C.glight], csv: ['📊', C.green, C.glight],
  doc: ['📝', C.blue, C.blight], docx: ['📝', C.blue, C.blight],
  ppt: ['📽️', C.orange, C.olight], pptx: ['📽️', C.orange, C.olight],
  zip: ['🗜️', C.muted, C.bg], rar: ['🗜️', C.muted, C.bg], '7z': ['🗜️', C.muted, C.bg],
  txt: ['📄', C.muted, C.bg], log: ['📄', C.muted, C.bg],
}
const DEFAULT_META = ['📎', C.muted, C.bg]

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

export default function AttachmentCard({ fileName, subtitle, onClick, mine = false, size = 34 }) {
  const { t } = useLang()
  const [icon, fg, bg] = EXT_META[extOf(fileName)] || DEFAULT_META

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginTop: 6,
      background: mine ? 'rgba(255,255,255,.15)' : C.white,
      border: mine ? 'none' : `1px solid ${C.border}`,
      borderRadius: 10, padding: '7px 10px', maxWidth: 260, boxSizing: 'border-box',
    }}>
      <div style={{
        width: size, height: size, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45, flexShrink: 0,
        background: mine ? 'rgba(255,255,255,.2)' : bg,
        color: mine ? '#fff' : fg,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: mine ? '#fff' : C.text }}>{fileName}</div>
        {subtitle && (
          <div style={{ fontSize: 9.5, color: mine ? 'rgba(255,255,255,.75)' : C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{subtitle}</div>
        )}
        <div style={{ fontSize: 9.5, fontWeight: 700, color: mine ? '#fff' : C.blue, marginTop: 2 }}>{t('Otwórz w aplikacji ↗')}</div>
      </div>
    </div>
  )
}
