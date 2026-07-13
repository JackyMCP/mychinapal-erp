import { useLang } from "../../lib/i18n/LanguageContext";
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName } from '../../lib/files'
import { C } from '../../lib/theme'
import { DOC_CATEGORIES } from './stageDefs'

export default function ProjectFiles({ project, documents, onChanged }) {
  const { t } = useLang()
  const [category, setCategory] = useState(DOC_CATEGORIES[DOC_CATEGORIES.length - 1] || DOC_CATEGORIES[0])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${project.client_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, file)
    if (upErr) { setUploading(false); alert('Nie udało się wgrać pliku: ' + upErr.message); return }
    const { error: docErr } = await supabase.from('documents').insert({
      client_id: project.client_id, project_id: project.id,
      category, file_path: path, file_name: file.name, uploaded_by: user.id, source: 'manual',
    })
    setUploading(false)
    if (docErr) { alert('Nie udało się zapisać dokumentu: ' + docErr.message); return }
    onChanged && onChanged()
    if (fileRef.current) fileRef.current.value = ''
  }

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

  const sorted = [...(documents || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>📁 {t('Pliki projektu')}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 11, outline: 'none' }}>
            {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: '7px 13px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: uploading ? .6 : 1 }}>
            {uploading ? t('Wgrywanie…') : t('+ Wgraj plik')}
          </button>
        </div>
      </div>

      {sorted.length === 0 && (
        <div style={{ fontSize: 11, color: C.muted }}>
          {t('Brak plików — pliki wysłane na czacie tego zamówienia pojawią się tutaj automatycznie, albo wgraj je ręcznie powyżej.')}
        </div>
      )}
      {sorted.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
          <span onClick={() => handleDownload(doc)} style={{ cursor: 'pointer', fontSize: 17, flexShrink: 0 }}>📎</span>
          <div onClick={() => handleDownload(doc)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{t(doc.category)} · {new Date(doc.created_at).toLocaleDateString('pl-PL')}{doc.source === 'chat' ? ` · ${t('z czatu')}` : ''}</div>
          </div>
          <span onClick={(e) => handleDelete(doc, e)} title={t('Usuń plik')}
            style={{ fontSize: 13, color: C.muted, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = C.rlight; e.currentTarget.style.color = C.red }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}
          >🗑</span>
        </div>
      ))}
    </div>
  )
}
