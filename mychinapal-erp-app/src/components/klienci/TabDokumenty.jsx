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

export default function TabDokumenty({ documents, projects, onChanged }) {
  const { t } = useLang()
  const projectLabelById = Object.fromEntries((projects || []).map(p => [p.id, p.order_label]))

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc, e) => {
    e.stopPropagation()
    if (!window.confirm(t('Usunąć plik „' + doc.file_name + '”? Tej operacji nie da się cofnąć.'))) return
    const { error: stErr } = await supabase.storage.from('dokumenty').remove([doc.file_path])
    if (stErr) { alert('Nie udało się usunąć pliku z magazynu: ' + stErr.message); return }
    const { data: delRows, error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id).select()
    if (dbErr) { alert('Nie udało się usunąć wpisu dokumentu: ' + dbErr.message); return }
    if (!delRows || delRows.length === 0) { alert(t('Brak uprawnień do usunięcia tego pliku — możesz usuwać tylko własne pliki (chyba że masz rolę Zarządu).')); return }
    onChanged && onChanged()
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
            <span onClick={(e) => handleDelete(d, e)} title={t('Usuń plik')}
              style={{ fontSize: 13, color: C.muted, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = C.rlight; e.currentTarget.style.color = C.red }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}
            >🗑</span>
          </div>
        )
      })}
    </div>
  )
}
