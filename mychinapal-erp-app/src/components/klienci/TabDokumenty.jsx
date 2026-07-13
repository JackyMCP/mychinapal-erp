import { useLang } from "../../lib/i18n/LanguageContext";
import { C } from '../../lib/theme'
import { supabase } from '../../lib/supabaseClient'

const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }

const CAT_STYLE = {
  'Faktura pro-forma': ['📄', C.blight, C.blue],
  'Faktura zaliczkowa': ['📄', C.blight, C.blue],
  'Faktura końcowa': ['📄', C.blight, C.blue],
  'Faktura transportowa': ['🚢', C.olight, C.orange],
  'CI Zonglu': ['🧾', C.glight, C.green],
  'CI Fabryka': ['🧾', C.glight, C.green],
  'Kontrola jakości': ['📋', C.plight, C.purple],
  'Odprawa celna Chiny': ['🏛️', C.rlight, C.red],
  'Dokument transportowy': ['🚢', C.olight, C.orange],
  'SAD': ['🏛️', C.rlight, C.red],
  'Wycena': ['💰', C.bg, C.muted],
}

export default function TabDokumenty({ documents, projects }) {
  const { t } = useLang()
  const projectLabelById = Object.fromEntries((projects || []).map(p => [p.id, p.order_label]))

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (documents.length === 0) return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, fontSize: 11, color: C.muted }}>
      {t("Brak dokumentów — pliki wysłane na czacie tego klienta pojawią się tutaj automatycznie.")}
    </div>
  )

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>📎 {t("Wszystkie dokumenty tego klienta")}</div>
      {documents.map(d => {
        const [ico, bg, fg] = CAT_STYLE[d.category] || ['📎', C.bg, C.muted]
        const projLabel = d.project_id ? projectLabelById[d.project_id] : null
        return (
          <div key={d.id} onClick={() => handleDownload(d)} style={row}>
            <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0, background: bg, color: fg }}>{ico}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{projLabel ? `${projLabel} · ` : ''}{new Date(d.created_at).toLocaleDateString('pl-PL')}{d.source === 'chat' ? ` · ${t('z czatu')}` : ''}</div>
            </div>
            <span style={{ fontSize: 9.5, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{t(d.category)}</span>
          </div>
        )
      })}
    </div>
  )
}
