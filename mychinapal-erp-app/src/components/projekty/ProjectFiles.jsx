import { useLang } from "../../lib/i18n/LanguageContext";
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { C } from '../../lib/theme'
import { DOC_CATEGORIES } from './stageDefs'
import { useUI } from '../../lib/ui'
import EmptyState from '../ui/EmptyState'
import { createQuoteFromExcelFile, isExcelFile } from '../../lib/quoteIntake'

export default function ProjectFiles({ project, documents, onChanged }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const [category, setCategory] = useState(DOC_CATEGORIES[DOC_CATEGORIES.length - 1] || DOC_CATEGORIES[0])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const fileRef = useRef(null)

  // Excel z kategorią "Wycena" to nowy przepływ: zespół CN wgrywa tu gotową
  // wycenę zamiast wypełniać ją ręcznie w aplikacji. Plik zostaje sparsowany
  // (te same reguły co dotychczasowy import w zakładce Wyceny), powstaje
  // nowa wycena i cały zespół PL przypisany do zamówienia dostaje zadanie —
  // dokładnie tak samo, jakby ktoś wgrał ten sam plik wprost w Wycenach.
  const handleQuoteExcelUpload = async (file) => {
    setUploading(true)
    const { data: quotesRows } = await supabase.from('quotes').select('quote_number')
    const result = await createQuoteFromExcelFile(file, project, { id: project.client_id }, (quotesRows || []).map(q => q.quote_number))
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!result.ok) { toast.error(t('Nie udało się przyjąć wyceny z Excela: ') + result.error); return }
    const actionLabel = result.overwritten ? t('Wycena nadpisana nowymi danymi ✓') : t('Wycena przyjęta ✓')
    toast.success(t(`${actionLabel} ${result.itemCount} pozycji — powiadomiono ${result.notified} os. z zespołu PL`))
    if (result.notifyFailed) toast.error(t('Uwaga: część powiadomień do zespołu PL mogła się nie wysłać.'))
    onChanged && onChanged()
  }

  const handleUpload = async (file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }
    if (category === 'Wycena' && isExcelFile(file)) { await handleQuoteExcelUpload(file); return }
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${project.client_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, file)
    if (upErr) { setUploading(false); toast.error('Nie udało się wgrać pliku: ' + upErr.message); return }
    const { error: docErr } = await supabase.from('documents').insert({
      client_id: project.client_id, project_id: project.id,
      category, file_path: path, file_name: file.name, uploaded_by: user.id, source: 'manual',
    })
    setUploading(false)
    if (docErr) { toast.error('Nie udało się zapisać dokumentu: ' + docErr.message); return }
    onChanged && onChanged()
    if (fileRef.current) fileRef.current.value = ''
  }

  // Przeciągnij-i-upuść — pozwala wgrać plik przeciągnięty wprost z innej aplikacji
  // (np. z okna czatu WeChat na komputerze) bez zapisywania go najpierw na dysk.
  const handleDragOver = (e) => { e.preventDefault(); if (!uploading) setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const file = e.dataTransfer?.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc, e) => {
    e.stopPropagation()
    if (!await confirm(t('Usunąć plik „' + doc.file_name + '”? Tej operacji nie da się cofnąć.'))) return
    const { error: stErr } = await supabase.storage.from('dokumenty').remove([doc.file_path])
    if (stErr) { toast.error('Nie udało się usunąć pliku z magazynu: ' + stErr.message); return }
    const { data: delRows, error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id).select()
    if (dbErr) { toast.error('Nie udało się usunąć wpisu dokumentu: ' + dbErr.message); return }
    if (!delRows || delRows.length === 0) { toast.error(t('Brak uprawnień do usunięcia tego pliku — możesz usuwać tylko własne pliki (chyba że masz rolę Zarządu).')); return }
    onChanged && onChanged()
  }

  // Masowe usuwanie — zgłoszone jako potrzebne, gdy w projekcie nazbiera się
  // dużo plików naraz (np. z powtarzanych prób) i klikanie kosza pojedynczo
  // za każdym razem z osobnym potwierdzeniem jest zbyt uciążliwe. "Zaznacz
  // wszystkie" + jedno potwierdzenie na koniec załatwia to w 2 kliknięciach.
  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === sorted.length ? new Set() : new Set(sorted.map(d => d.id)))
  }
  const handleBulkDelete = async () => {
    if (!selected.size) return
    if (!await confirm(t(`Usunąć ${selected.size} zaznaczonych plików? Tej operacji nie da się cofnąć.`))) return
    setBulkDeleting(true)
    const toDelete = sorted.filter(d => selected.has(d.id))
    const paths = toDelete.map(d => d.file_path)
    if (paths.length) await supabase.storage.from('dokumenty').remove(paths)
    const { data: delRows } = await supabase.from('documents').delete().in('id', toDelete.map(d => d.id)).select('id')
    const deletedCount = delRows?.length || 0
    setBulkDeleting(false)
    setSelected(new Set())
    setSelectMode(false)
    if (deletedCount < toDelete.length) {
      toast.error(t(`Usunięto ${deletedCount} z ${toDelete.length} — reszta to nie Twoje pliki (możesz usuwać tylko własne, chyba że masz rolę Zarządu).`))
    } else {
      toast.success(t(`Usunięto ${deletedCount} plików ✓`))
    }
    onChanged && onChanged()
  }

  const sorted = [...(documents || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{
        background: dragOver ? C.blight : C.white, border: `1.5px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? C.blue : C.border}`,
        borderRadius: 14, padding: '16px 18px', marginBottom: 16, transition: 'all .12s ease',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>📁 {t('Pliki projektu')}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {selectMode ? (
            <>
              <span onClick={toggleSelectAll} style={{ fontSize: 11, fontWeight: 600, color: C.blue, cursor: 'pointer' }}>
                {selected.size === sorted.length ? t('Odznacz wszystkie') : t('Zaznacz wszystkie')}
              </span>
              <button onClick={handleBulkDelete} disabled={!selected.size || bulkDeleting}
                style={{ padding: '7px 13px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: selected.size ? 'pointer' : 'default', background: selected.size ? C.red : C.border, color: '#fff', opacity: bulkDeleting ? .6 : 1 }}>
                {bulkDeleting ? t('Usuwanie…') : t(`🗑 Usuń zaznaczone (${selected.size})`)}
              </button>
              <span onClick={() => { setSelectMode(false); setSelected(new Set()) }} style={{ fontSize: 11, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>{t('Anuluj')}</span>
            </>
          ) : (
            <>
              {sorted.length > 0 && (
                <span onClick={() => setSelectMode(true)} style={{ fontSize: 11, fontWeight: 600, color: C.text2, cursor: 'pointer', padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.border}` }}>
                  {t('Zaznacz i usuń wiele')}
                </span>
              )}
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 11, outline: 'none' }}>
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
              </select>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ padding: '7px 13px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: uploading ? .6 : 1 }}>
                {uploading ? t('Przetwarzanie…') : t(category === 'Wycena' ? '+ Wgraj Excel z wyceną' : '+ Wgraj plik')}
              </button>
            </>
          )}
        </div>
      </div>

      {!selectMode && category === 'Wycena' && (
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, marginTop: -4 }}>
          {t('Wgranie tu pliku Excel (.xlsx/.xls) automatycznie utworzy wycenę z pozycjami i zdjęciami oraz powiadomi zespół PL.')}
        </div>
      )}

      {sorted.length === 0 && (
        <EmptyState icon="📁" title={t('Brak plików')} subtitle={t(dragOver ? '↓ Upuść plik tutaj' : 'Pliki wysłane na czacie tego zamówienia pojawią się tutaj automatycznie, albo przeciągnij plik (np. z WeChat) lub wgraj ręcznie powyżej.')} />
      )}
      {sorted.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
          {selectMode && (
            <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelected(doc.id)}
              style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
          )}
          <span onClick={() => selectMode ? toggleSelected(doc.id) : handleDownload(doc)} style={{ cursor: 'pointer', fontSize: 17, flexShrink: 0 }}>📎</span>
          <div onClick={() => selectMode ? toggleSelected(doc.id) : handleDownload(doc)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{t(doc.category)} · {new Date(doc.created_at).toLocaleDateString('pl-PL')}{doc.source === 'chat' ? ` · ${t('z czatu')}` : ''}</div>
          </div>
          {!selectMode && <span onClick={(e) => handleDelete(doc, e)} title={t('Usuń plik')}
            style={{ fontSize: 13, color: C.muted, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = C.rlight; e.currentTarget.style.color = C.red }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}
          >🗑</span>}
        </div>
      ))}
    </div>
  )
}
