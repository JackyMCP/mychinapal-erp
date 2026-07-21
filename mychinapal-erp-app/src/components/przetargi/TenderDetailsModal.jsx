import { useEffect, useState } from 'react'
import { useLang } from '../../lib/i18n/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import { useUI } from '../../lib/ui'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

const STATUS_OPTIONS = [
  'nowy', 'do_oceny', 'zakwalifikowany', 'w_przygotowaniu', 'zlozona_oferta',
  'wygrany', 'przegrany', 'uniewazniony', 'odrzucony',
]
const STATUS_LABELS = {
  nowy: 'Nowy', do_oceny: 'Do oceny', zakwalifikowany: 'Zakwalifikowany',
  w_przygotowaniu: 'W przygotowaniu', zlozona_oferta: 'Złożona oferta',
  wygrany: 'Wygrany', przegrany: 'Przegrany', uniewazniony: 'Unieważniony', odrzucony: 'Odrzucony',
}

const fieldLabel = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }
const fieldBox = { fontSize: 12.5, color: C.text, marginBottom: 14 }

// Karta szczegółów przetargu (PLAN-PANEL-PRZETARGOW.md sekcja 7.4) — wzorem
// modali istniejących w innych modułach (overlay fixed + karta wyśrodkowana,
// patrz np. components/wyceny/QuotePreviewModal.jsx).
export default function TenderDetailsModal({ tenderId, onClose, onChanged }) {
  const { t } = useLang()
  const { profile } = useAuth()
  const { toast } = useUI()

  const [tender, setTender] = useState(null)
  const [notes, setNotes] = useState([])
  const [documents, setDocuments] = useState([])
  const [profiles, setProfiles] = useState([])
  const [noteText, setNoteText] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [tRes, nRes, dRes, pRes] = await Promise.all([
      supabase.from('tenders').select('*').eq('id', tenderId).single(),
      supabase.from('tender_notes').select('*, profiles(full_name)').eq('tender_id', tenderId).order('created_at'),
      supabase.from('tender_documents').select('*').eq('tender_id', tenderId).order('created_at'),
      supabase.from('profiles').select('id, full_name'),
    ])
    setTender(tRes.data || null)
    setNotes(nRes.data || [])
    setDocuments(dRes.data || [])
    setProfiles(pRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [tenderId])

  const handleStatusChange = async (newStatus) => {
    const { error } = await supabase.from('tenders').update({ status: newStatus }).eq('id', tenderId)
    if (error) { toast.error(t('Nie udało się zmienić statusu: ') + error.message); return }
    toast.success(t('Status zaktualizowany.'))
    load()
    onChanged?.()
  }

  const handleAssign = async (userId) => {
    const { error } = await supabase.from('tenders').update({ assigned_to: userId || null }).eq('id', tenderId)
    if (error) { toast.error(t('Nie udało się przypisać osoby: ') + error.message); return }
    load()
    onChanged?.()
  }

  const handleAddNote = async () => {
    const content = noteText.trim()
    if (!content || !profile?.id) return
    const { error } = await supabase.from('tender_notes').insert({ tender_id: tenderId, author_id: profile.id, content })
    if (error) { toast.error(t('Nie udało się dodać notatki: ') + error.message); return }
    setNoteText('')
    load()
  }

  if (loading || !tender) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 12.5, color: C.muted }}>{t('Ładowanie…')}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15.5, fontWeight: 800, color: C.navy, lineHeight: 1.3 }}>{tender.title}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{tender.buyer_name || t('Nabywca nieznany')}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: C.bg, borderRadius: 8, width: 30, height: 30, fontSize: 14, cursor: 'pointer', color: C.muted, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <select value={tender.status} onChange={e => handleStatusChange(e.target.value)}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text, cursor: 'pointer' }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>)}
          </select>
          <select value={tender.assigned_to || ''} onChange={e => handleAssign(e.target.value)}
            style={{ fontSize: 11.5, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text2, cursor: 'pointer' }}>
            <option value="">{t('Nieprzypisane')}</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          {tender.source_url && (
            <a href={tender.source_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 11.5, padding: '7px 12px', borderRadius: 8, background: C.blight, color: C.blue, fontWeight: 700, textDecoration: 'none' }}>
              {t('🔗 Otwórz źródło')}
            </a>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          <div>
            <div style={fieldLabel}>{t('Kategoria')}</div>
            <div style={fieldBox}>{tender.category || '—'}</div>
          </div>
          <div>
            <div style={fieldLabel}>{t('Dopasowanie')}</div>
            <div style={fieldBox}>{tender.match_score != null ? `${tender.match_score}/100` : '—'}{tender.match_reasoning ? ` — ${tender.match_reasoning}` : ''}</div>
          </div>
          <div>
            <div style={fieldLabel}>{t('Wartość szacunkowa')}</div>
            <div style={fieldBox}>{tender.estimated_value ? `${Number(tender.estimated_value).toLocaleString('pl-PL')} ${tender.currency}` : '—'}</div>
          </div>
          <div>
            <div style={fieldLabel}>{t('Termin składania ofert')}</div>
            <div style={fieldBox}>{tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleString('pl-PL') : '—'}</div>
          </div>
          <div>
            <div style={fieldLabel}>{t('Miejsce realizacji')}</div>
            <div style={fieldBox}>{tender.fulfillment_place || '—'}</div>
          </div>
          <div>
            <div style={fieldLabel}>{t('Kody CPV')}</div>
            <div style={fieldBox}>{(tender.cpv_codes || []).join(', ') || '—'}</div>
          </div>
        </div>

        {tender.content_excerpt && (
          <div style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>{t('Opis')}</div>
            <div style={{ ...fieldBox, background: C.bg, borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{tender.content_excerpt}</div>
          </div>
        )}

        {(tender.risk_flags || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>{t('Flagi ryzyka')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tender.risk_flags.map(f => (
                <span key={f} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 20, background: C.rlight, color: C.red }}>⚠️ {f}</span>
              ))}
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={fieldLabel}>{t('Dokumenty')}</div>
            {documents.map(d => (
              <div key={d.id} style={{ fontSize: 12, padding: '6px 0', color: C.blue }}>📎 {d.file_name}</div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div style={fieldLabel}>{t('Notatki zespołu')}</div>
          <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
            {notes.length === 0 && <div style={{ fontSize: 11.5, color: C.muted }}>{t('Brak notatek.')}</div>}
            {notes.map(n => (
              <div key={n.id} style={{ fontSize: 12, marginBottom: 8, background: C.bg, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, fontSize: 10.5, color: C.muted, marginBottom: 2 }}>{n.profiles?.full_name || '—'} · {new Date(n.created_at).toLocaleString('pl-PL')}</div>
                {n.content}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddNote() }}
              placeholder={t('Dodaj notatkę…')}
              style={{ flex: 1, fontSize: 12.5, padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, outline: 'none' }} />
            <button onClick={handleAddNote} style={{ border: 'none', background: C.blue, color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {t('Dodaj')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const cardStyle = { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }
