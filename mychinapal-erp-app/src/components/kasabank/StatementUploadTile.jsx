import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import { useLang } from '../../lib/i18n/LanguageContext'

// Kafelek do cotygodniowego wgrywania wyciągu bankowego (PDF) — AI (Claude)
// czyta plik i sam wyciąga wszystkie transakcje, które lądują w rejestrze
// ze statusem "NIE ROZLICZONO" i pustą kategorią/klientem — resztę uzupełnia
// człowiek w zakładce Transakcje, dokładnie tak jak dziś robi to ręcznie.
export default function StatementUploadTile({ company, accountLabel, onUploaded }) {
  const { t } = useLang()
  const { toast } = useUI()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error(t('Wyciąg musi być plikiem PDF.')); return }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(',')[1]
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase.functions.invoke('parse-bank-statement', {
          body: { company, account_label: accountLabel || null, file_base64: base64, file_name: file.name, uploaded_by: user?.id },
        })
        if (error || data?.error) {
          toast.error(t('Nie udało się przetworzyć wyciągu: ') + (data?.error || error?.message || ''))
        } else {
          toast.success(`${t('Rozpoznano')} ${data.parsed_count} ${t('transakcji — uzupełnij kategorie i klientów w liście poniżej.')}`)
          onUploaded?.()
        }
      } catch (e) {
        toast.error(t('Nie udało się przetworzyć wyciągu: ') + String(e))
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.onerror = () => { setUploading(false); toast.error(t('Nie udało się odczytać pliku.')) }
    reader.readAsDataURL(file)
  }

  return (
    <div onClick={() => !uploading && fileRef.current?.click()} className="statement-upload-tile"
      style={{
        border: `2px dashed ${C.blue}`, borderRadius: 13, padding: '18px 20px', cursor: uploading ? 'default' : 'pointer',
        background: `linear-gradient(120deg, ${C.blight}, #fff)`, display: 'flex', alignItems: 'center', gap: 14,
        opacity: uploading ? .75 : 1, marginBottom: 14,
      }}>
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      <div style={{ width: 46, height: 46, borderRadius: 11, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: '0 2px 8px rgba(37,99,235,.15)' }}>
        {uploading ? '⏳' : '📄'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700, color: C.blue }}>
          {uploading ? t('Analizuję wyciąg…') : t('Wgraj wyciąg bankowy (PDF)')}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {uploading ? t('To może potrwać do minuty.') : t('AI automatycznie rozpozna transakcje — Ty tylko uzupełnisz kategorie i klientów.')}
        </div>
      </div>
      {!uploading && <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.blue, borderRadius: 8, padding: '7px 14px', whiteSpace: 'nowrap' }}>{t('Wybierz plik')}</div>}
      <style>{`.statement-upload-tile:hover { box-shadow: 0 6px 20px rgba(37,99,235,.15); transform: translateY(-1px); } .statement-upload-tile { transition: all .15s ease; }`}</style>
    </div>
  )
}
