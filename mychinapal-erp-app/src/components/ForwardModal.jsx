import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import { shareFile, shareText } from '../lib/share'
import FilePreviewModal from './ui/FilePreviewModal'

// Modal "Prześlij dalej" — wspólny dla wiadomości czatu, wycen i plików
// (Czat wewnętrzny, czat klienta, czat zamówienia, Pliki projektu, Dokumenty
// klienta, kafelki Wyceny). Dwie akcje:
//  1) Prześlij do innego czatu w aplikacji — lista kanałów, do których
//     zalogowana osoba ma dostęp, ogranicza się SAMA dzięki regule dostępu
//     na chat_channels (ta sama reguła co w Czat.jsx — nic dodatkowego nie
//     trzeba tu filtrować ręcznie). Kliknięcie od razu wysyła kopię
//     wiadomości/pliku do wybranego kanału, można wybrać kilka pod rząd.
//  2) Udostępnij na zewnątrz (WhatsApp/Messenger/WeChat itd.) — patrz
//     lib/share.js i ustalenie z użytkownikiem: to systemowe okno
//     "Udostępnij" (Web Share API), nie automatyczna wysyłka bez udziału
//     osoby.
//
// payload: { text, documentId?, fileName?, filePath? }
//   - documentId: istniejący wiersz `documents` (chat_messages.attachment_document_id)
//   - filePath/fileName: gdy nie ma jeszcze wiersza documents (np. plik wyceny
//     w Wyceny.jsx) — używane TYLKO do "Udostępnij na zewnątrz"; przesłanie
//     do czatu wymaga documentId (patrz wywołania w Wyceny.jsx, gdzie
//     documentId jest doszukiwany przed otwarciem tego modala).

const TYPE_STYLE = {
  ogolny:  { icon: '💬', label: 'Ogólny' },
  klient:  { icon: '🧑‍💼', label: 'Klient' },
  projekt: { icon: '📦', label: 'Projekt' },
  zarzad:  { icon: '👑', label: 'Zarząd' },
}
function channelType(ch) {
  if (ch.project_id) return 'projekt'
  if (ch.client_id) return 'klient'
  if (ch.zarzad_only) return 'zarzad'
  return 'ogolny'
}
function channelLabel(ch) {
  if (ch.project_id) return ch.projects?.order_label || '—'
  if (ch.client_id) return ch.clients?.name || '—'
  return ch.name
}

export default function ForwardModal({ payload, onClose }) {
  const { t } = useLang()
  const { toast } = useUI()

  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState([])
  const [search, setSearch] = useState('')
  const [sentIds, setSentIds] = useState(() => new Set())
  const [sendingId, setSendingId] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [previewFile, setPreviewFile] = useState(null) // fallback: podgląd w aplikacji zamiast nowej karty przeglądarki

  useEffect(() => {
    supabase.from('chat_channels').select('*, clients(name), projects(order_label)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(t('Nie udało się wczytać listy czatów: ') + error.message)
        setChannels(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return channels.filter(ch => !q || channelLabel(ch).toLowerCase().includes(q))
  }, [channels, search])

  const handleSend = async (channel) => {
    setSendingId(channel.id)
    const { data: { user } } = await supabase.auth.getUser()
    const content = payload.text?.trim() || (payload.fileName ? `📎 ${payload.fileName}` : '')
    const { error } = await supabase.from('chat_messages').insert({
      channel_id: channel.id, sender_id: user.id, content: content || '📎',
      attachment_document_id: payload.documentId || null,
    })
    setSendingId(null)
    if (error) { toast.error(t('Nie udało się przesłać: ') + error.message); return }
    setSentIds(prev => new Set(prev).add(channel.id))
    toast.success(t('Przesłano do: ') + channelLabel(channel))
  }

  const handleShare = async () => {
    setSharing(true)
    // payload.filePath jest znane od razu tylko tam, gdzie wywołujący ma je
    // pod ręką bez zapytania (np. kafelek Wyceny). Wiadomości czatu i wpisy
    // Dokumentów/Plików projektu przekazują tylko documentId — trzeba
    // doszukać file_path w tabeli documents, inaczej nie ma czego udostępnić.
    let filePath = payload.filePath
    if (!filePath && payload.documentId) {
      const { data } = await supabase.from('documents').select('file_path').eq('id', payload.documentId).maybeSingle()
      filePath = data?.file_path || null
    }
    if (filePath) {
      const result = await shareFile({ filePath, fileName: payload.fileName, text: payload.text, title: payload.fileName, toast, t })
      // Web Share API/schowek się nie udały (np. desktop bez wsparcia) —
      // zamiast otwierać plik w nowej karcie przeglądarki, pokazujemy podgląd
      // od razu tutaj, w aplikacji (patrz FilePreviewModal).
      if (result && result.ok === false && result.fallbackUrl) {
        setPreviewFile({ url: result.fallbackUrl, fileName: result.fallbackFileName || payload.fileName })
      }
    } else {
      await shareText({ text: payload.text || payload.fileName || '', toast, t })
    }
    setSharing(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 460, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>{t("↪ Prześlij dalej")}</div>
          <span onClick={onClose} style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>{t("✕ Gotowe")}</span>
        </div>

        {(payload.fileName || payload.text) && (
          <div style={{ fontSize: 11, color: C.muted, background: C.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {payload.fileName ? `📎 ${payload.fileName}` : payload.text}
          </div>
        )}

        <span onClick={sharing ? undefined : handleShare} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12.5, fontWeight: 700,
          color: '#fff', background: sharing ? C.muted : C.green, padding: '10px 14px', borderRadius: 9,
          cursor: sharing ? 'default' : 'pointer', marginBottom: 14,
        }}>
          {sharing ? t('Otwieranie…') : t('📤 Udostępnij na zewnątrz (WhatsApp, Messenger, WeChat…)')}
        </span>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 8 }}>
          {t("...albo prześlij do czatu w aplikacji")}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj czatu…")}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10, outline: 'none' }} />

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>{t("Wczytywanie…")}</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>{t("Brak czatów.")}</div>
          ) : filtered.map(ch => {
            const type = channelType(ch)
            const st = TYPE_STYLE[type]
            const sent = sentIds.has(ch.id)
            return (
              <div key={ch.id} onClick={() => (sendingId || sent) ? undefined : handleSend(ch)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 6px', borderRadius: 8, cursor: sent ? 'default' : 'pointer',
                opacity: sendingId && sendingId !== ch.id ? .5 : 1,
              }}
                onMouseEnter={e => { if (!sent) e.currentTarget.style.background = C.bg }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{st.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelLabel(ch)}</div>
                  <div style={{ fontSize: 9.5, color: C.muted }}>{t(st.label)}</div>
                </div>
                {sendingId === ch.id ? (
                  <span style={{ fontSize: 11, color: C.muted }}>{t('wysyłanie…')}</span>
                ) : sent ? (
                  <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓</span>
                ) : (
                  <span style={{ fontSize: 11, color: C.blue, fontWeight: 700 }}>{t('Wyślij')}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {previewFile && <FilePreviewModal url={previewFile.url} fileName={previewFile.fileName} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}
