import { useLang } from "../../lib/i18n/LanguageContext";
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { C } from '../../lib/theme'
import { STAGE_DEFS } from './stageDefs'
import { useUI } from '../../lib/ui'

const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color: fg })

function StageCard({ stage, status, docsByCategory, project, onUploaded }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const [open, setOpen] = useState(status === 'current')
  const [uploading, setUploading] = useState(false)
  const [category, setCategory] = useState(stage.categories[0])
  const fileRef = useRef(null)

  const handleUpload = async (file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }
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
    onUploaded && onUploaded()
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDelete = async (doc) => {
    if (!await confirm(t('Usunąć plik „' + doc.file_name + '”? Tej operacji nie da się cofnąć.'))) return
    const { error: stErr } = await supabase.storage.from('dokumenty').remove([doc.file_path])
    if (stErr) { toast.error('Nie udało się usunąć pliku z magazynu: ' + stErr.message); return }
    const { data: delRows, error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id).select()
    if (dbErr) { toast.error('Nie udało się usunąć wpisu dokumentu: ' + dbErr.message); return }
    if (!delRows || delRows.length === 0) { toast.error(t('Brak uprawnień do usunięcia tego pliku — możesz usuwać tylko własne pliki (chyba że masz rolę Zarządu).')); return }
    onUploaded && onUploaded()
  }

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const isLocked = status === 'locked'
  const dotColor = status === 'done' ? C.green : status === 'current' ? C.blue : C.border
  const dotBg = status === 'locked' ? { background: C.border, color: C.muted } : { background: dotColor, color: '#fff' }

  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 34, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, zIndex: 2, boxShadow: status === 'current' ? `0 0 0 4px ${C.bmid}` : 'none', ...dotBg }}>
          {status === 'done' ? '✓' : status === 'locked' ? '🔒' : stage.key}
        </div>
        {stage.key < STAGE_DEFS.length && <div style={{ width: 2, flex: 1, background: status === 'done' ? C.green : C.border, margin: '2px 0' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ border: `1px solid ${status === 'current' ? C.bmid : C.border}`, borderRadius: 12, overflow: 'hidden', opacity: isLocked ? .68 : 1, boxShadow: status === 'current' ? '0 4px 16px rgba(37,99,235,.08)' : 'none' }}>
          <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', cursor: 'pointer' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t("Etap")} {stage.key}— {t(stage.name)}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{t(stage.desc)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={pill(
                status === 'done' ? C.glight : status === 'current' ? C.blight : C.bg,
                status === 'done' ? C.green : status === 'current' ? C.blue : C.muted
              )}>{status === 'done' ? t("zakończony") : status === 'current' ? t('aktualny') : t('zablokowany')}</span>
              <span style={{ fontSize: 11, color: C.muted, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
            </div>
          </div>
          <div style={{ maxHeight: open ? 2000 : 0, overflow: 'hidden', transition: 'max-height .32s ease', borderTop: open ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', margin: '14px 0 6px' }}>{t("Wymagane dokumenty")}</div>
              {stage.categories.map(cat => {
                const docs = docsByCategory[cat] || []
                return (
                  <div key={cat} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12 }}>
                      <div style={{ width: 19, height: 19, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, background: docs.length ? C.glight : C.rlight, color: docs.length ? C.green : C.red }}>{docs.length ? '✓' : '✗'}</div>
                      {t(cat)}{docs.length > 0 ? t(` — wgrano ${docs.length} plik(ów)`) : t(" — brakuje")}
                    </div>
                    {docs.length > 0 && (
                      <div style={{ marginTop: 6, marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {docs.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <span onClick={() => handleDownload(doc)} style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', color: C.blue }}>{doc.file_name}</span>
                            <span onClick={() => handleDelete(doc)} title={t('Usuń plik')}
                              style={{ fontSize: 12, color: C.muted, padding: '2px 5px', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.background = C.rlight; e.currentTarget.style.color = C.red }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}
                            >🗑</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {status !== 'locked' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={category} onChange={e => setCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 11 }}>
                      {stage.categories.map(c => <option key={c} value={c}>{t(c)}</option>)}
                    </select>
                    <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files?.[0])} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: uploading ? .6 : 1 }}>
                      {uploading ? t("Wgrywanie…") : t("📎 Wgraj dokument")}
                    </button>
                  </div>
                </div>
              )}
              {status === 'locked' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.olight, color: C.orange, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600, marginTop: 10 }}>
                  {t("🔒 Odblokuje się automatycznie po zamknięciu poprzedniego etapu")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StageTimeline({ project, documents, onDocumentsChanged }) {
  const {
    t
  } = useLang();

  const docsByCategory = {}
  for (const d of documents) {
    if (!docsByCategory[d.category]) docsByCategory[d.category] = []
    docsByCategory[d.category].push(d)
  }
  const presentCategories = new Set(documents.map(d => d.category))
  let currentIndex = null
  const doneStages = new Set()
  for (const stage of STAGE_DEFS) {
    const satisfied = stage.categories.every(c => presentCategories.has(c))
    if (satisfied) doneStages.add(stage.key)
    else if (currentIndex === null) currentIndex = stage.key
  }

  return (
    <div>
      {STAGE_DEFS.map(stage => {
        const status = doneStages.has(stage.key) ? 'done' : (stage.key === currentIndex ? 'current' : (currentIndex !== null && stage.key > currentIndex ? 'locked' : 'done'))
        return <StageCard key={stage.key} stage={stage} status={status} docsByCategory={docsByCategory} project={project} onUploaded={onDocumentsChanged} />
      })}
    </div>
  )
}
