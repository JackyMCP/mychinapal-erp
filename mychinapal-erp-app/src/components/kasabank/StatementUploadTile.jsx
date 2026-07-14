import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import { useLang } from '../../lib/i18n/LanguageContext'

// Kafelek do cotygodniowego wgrywania wyciągu bankowego (PDF) — AI (Claude)
// czyta plik i sam wyciąga wszystkie transakcje, które lądują w rejestrze
// ze statusem "NIE ROZLICZONO" i pustą kategorią/klientem — resztę uzupełnia
// człowiek w zakładce Transakcje, dokładnie tak jak dziś robi to ręcznie.
const MAX_FILES = 4

export default function StatementUploadTile({ company, accountLabel, onUploaded }) {
  const { t } = useLang()
  const { toast } = useUI()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total }

  const readAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error(t('Nie udało się odczytać pliku.')))
    reader.readAsDataURL(file)
  })

  const uploadOne = async (file, uploaderId) => {
    const base64 = await readAsBase64(file)
    const { data, error } = await supabase.functions.invoke('parse-bank-statement', {
      body: { company, account_label: accountLabel || null, file_base64: base64, file_name: file.name, uploaded_by: uploaderId },
    })
    if (error || data?.error) throw new Error(data?.error || error?.message || t('Nieznany błąd'))
    return data
  }

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (files.length === 0) return
    if (files.length > MAX_FILES) { toast.error(`${t('Możesz wgrać naraz maksymalnie')} ${MAX_FILES} ${t('pliki.')}`); return }
    const notPdf = files.find(f => f.type !== 'application/pdf')
    if (notPdf) { toast.error(t('Wyciąg musi być plikiem PDF.')); return }

    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let totalParsed = 0
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length })
      try {
        const data = await uploadOne(files[i], user?.id)
        totalParsed += data.parsed_count || 0
      } catch (e) {
        failed += 1
        toast.error(`${files[i].name}: ${t('nie udało się przetworzyć —')} ${e.message}`)
      }
    }
    setUploading(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    const okCount = files.length - failed
    if (okCount > 0) {
      toast.success(`${t('Rozpoznano')} ${totalParsed} ${t('transakcji z')} ${okCount} ${okCount === 1 ? t('pliku') : t('plików')} — ${t('uzupełnij kategorie i klientów w liście poniżej.')}`)
      onUploaded?.()
    }
  }

  return (
    <div onClick={() => !uploading && fileRef.current?.click()} className="statement-upload-tile"
      style={{
        border: `2px dashed ${C.blue}`, borderRadius: 13, padding: '18px 20px', cursor: uploading ? 'default' : 'pointer',
        background: `linear-gradient(120deg, ${C.blight}, #fff)`, display: 'flex', alignItems: 'center', gap: 14,
        opacity: uploading ? .75 : 1, marginBottom: 14,
      }}>
      <input ref={fileRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
      <div style={{ width: 46, height: 46, borderRadius: 11, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: '0 2px 8px rgba(37,99,235,.15)' }}>
        {uploading ? '⏳' : '📄'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700, color: C.blue }}>
          {uploading ? `${t('Analizuję wyciąg')} ${progress ? `${progress.current}/${progress.total}` : ''}…` : t('Wgraj wyciąg bankowy (PDF)')}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {uploading ? t('To może potrwać do minuty na plik.') : t('AI automatycznie rozpozna transakcje — możesz wgrać nawet 4 pliki naraz.')}
        </div>
      </div>
      {!uploading && <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.blue, borderRadius: 8, padding: '7px 14px', whiteSpace: 'nowrap' }}>{t('Wybierz pliki (max 4)')}</div>}
      <style>{`.statement-upload-tile:hover { box-shadow: 0 6px 20px rgba(37,99,235,.15); transform: translateY(-1px); } .statement-upload-tile { transition: all .15s ease; }`}</style>
    </div>
  )
}
