import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'

// Modal "Załącz z aplikacji" — druga (obok "Załącz plik" z dysku) opcja
// dodawania załącznika do maila: wybór spośród plików już wgranych gdziekolwiek
// w aplikacji (Dokumenty klienta/projektu, czaty, Wyceny — wszystko trafia do
// wspólnej tabeli `documents`), od najnowszych. RLS na `documents` sam
// ogranicza listę do plików, do których zalogowana osoba ma dostęp — nic
// dodatkowego nie trzeba tu filtrować.
//
// onAttach(attachments) — wywoływane z tablicą obiektów w tym samym kształcie
// co przy załączaniu z dysku: { filename, contentType, base64, size }.

const CAT_ICON = {
  'Faktura pro-forma': '📄', 'Faktura zaliczkowa': '📄', 'Faktura końcowa': '📄',
  'Faktura transportowa': '🚢', 'CI Zonglu': '🧾', 'CI Fabryka': '🧾',
  'Kontrola jakości': '📋', 'Odprawa celna Chiny': '🏛️', 'Dokument transportowy': '🚢',
  'SAD': '🏛️', 'Wycena CN': '💰', 'Wycena dla klienta': '💰',
}

function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function AttachFromAppModal({ onClose, onAttach }) {
  const { t } = useLang()
  const { toast } = useUI()
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('documents')
      .select('id, file_name, file_path, category, created_at, clients(name), projects(order_label)')
      .eq('visible_in_files', true)
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data, error }) => {
        if (error) toast.error(t('Nie udało się wczytać listy plików: ') + error.message)
        setDocs(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(d =>
      (d.file_name || '').toLowerCase().includes(q) ||
      (d.clients?.name || '').toLowerCase().includes(q) ||
      (d.projects?.order_label || '').toLowerCase().includes(q)
    )
  }, [docs, search])

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    if (!selected.size) return
    setBusy(true)
    const chosen = docs.filter(d => selected.has(d.id))
    const results = []
    for (const doc of chosen) {
      const { data, error } = await supabase.storage.from('dokumenty').download(doc.file_path)
      if (error || !data) { toast.error(t('Nie udało się pobrać: ') + (doc.file_name || '') + (error ? ' — ' + error.message : '')); continue }
      const base64 = await blobToBase64(data)
      results.push({ filename: doc.file_name, contentType: data.type || 'application/octet-stream', base64, size: data.size })
    }
    setBusy(false)
    if (results.length) { onAttach(results); toast.success(t(`Dodano ${results.length} plik(ów) ✓`)) }
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={busy ? undefined : onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 460, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>{t('🗂 Załącz z aplikacji')}</div>
          <span onClick={busy ? undefined : onClose} style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, cursor: busy ? 'default' : 'pointer' }}>{t('✕ Zamknij')}</span>
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Szukaj pliku, klienta, zamówienia…')}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10, outline: 'none' }} />

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>{t('Wczytywanie…')}</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>{t('Brak plików.')}</div>
          ) : filtered.map(d => {
            const checked = selected.has(d.id)
            const sub = [d.clients?.name, d.projects?.order_label].filter(Boolean).join(' · ')
            return (
              <div key={d.id} onClick={() => toggle(d.id)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                background: checked ? C.blight : 'transparent',
              }}
                onMouseEnter={e => { if (!checked) e.currentTarget.style.background = C.bg }}
                onMouseLeave={e => { e.currentTarget.style.background = checked ? C.blight : 'transparent' }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(d.id)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 15, flexShrink: 0 }}>{CAT_ICON[d.category] || '📎'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name}</div>
                  <div style={{ fontSize: 9.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub ? `${sub} · ` : ''}{new Date(d.created_at).toLocaleDateString('pl-PL')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted }}>{selected.size > 0 ? t(`Wybrano: ${selected.size}`) : ''}</span>
          <button onClick={handleConfirm} disabled={!selected.size || busy}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: (!selected.size || busy) ? 'default' : 'pointer', opacity: (!selected.size || busy) ? .5 : 1 }}>
            {busy ? t('Dodawanie…') : t(`Dodaj (${selected.size})`)}
          </button>
        </div>
      </div>
    </div>
  )
}
