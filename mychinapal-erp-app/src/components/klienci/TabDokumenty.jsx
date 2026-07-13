import { useLang } from "../../lib/i18n/LanguageContext";
import { C } from '../../lib/theme'
import { supabase } from '../../lib/supabaseClient'

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }

export default function TabDokumenty({ documents }) {
  const {
    t
  } = useLang();

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 60)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (documents.length === 0) return (
    <div style={{ fontSize: 11, color: C.muted }}>{t(
      "Brak dokumentów — pliki wysłane na czacie tego klienta pojawią się tutaj automatycznie."
    )}</div>
  );

  return (
    <div>
      {documents.map(d => (
        <div key={d.id} onClick={() => handleDownload(d)} style={row}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>📎 {d.file_name}</span>
          <span style={{ fontSize: 10, color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: C.bg, padding: '1px 7px', borderRadius: 10 }}>{t(d.category)}</span>
            {d.source === 'chat' ? t("z czatu") : t("ręcznie")}
          </span>
        </div>
      ))}
    </div>
  );
}
