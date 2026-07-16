import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB, isImageFile } from '../../lib/files'
import { C } from '../../lib/theme'
import { DOC_CATEGORIES } from './stageDefs'
import { useUI } from '../../lib/ui'
import { triggerTranslation, triggerPushNotification } from '../../lib/translateMessage'
import AttachCategoryModal from '../ui/AttachCategoryModal'
import MentionInput from '../czat/MentionInput'
import MentionText from '../czat/MentionText'
import { extractMentions } from '../../lib/mentions'
import { createQuoteFromExcelFile, isExcelFile } from '../../lib/quoteIntake'

const LIMIT = 300 // maksymalna liczba ostatnich wiadomości wczytywanych na start (wydajność przy dużej historii)

const MSG_SELECT = '*, profiles(full_name), documents!attachment_document_id(id, file_name, category, file_path)'

export default function ProjectChat({ project }) {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()

  const [channelId, setChannelId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attachFile, setAttachFile] = useState(null)
  const [attachCategory, setAttachCategory] = useState(DOC_CATEGORIES[0])
  const [attachPreviewUrl, setAttachPreviewUrl] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [imgUrls, setImgUrls] = useState({})
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
  const [profiles, setProfiles] = useState([])
  const fileRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('profiles').select('id,full_name').then(({ data }) => setProfiles(data || []))
  }, [])

  useEffect(() => {
    (async () => {
      setLoading(true)
      let { data: ch } = await supabase.from('chat_channels').select('id').eq('project_id', project.id).limit(1).maybeSingle()
      const { data: { user } } = await supabase.auth.getUser()
      if (!ch) {
        const { data: created, error } = await supabase.from('chat_channels').insert({
          name: project.order_label, client_id: project.client_id, project_id: project.id, created_by: user.id,
        }).select().single()
        if (error) { console.error(error); setLoading(false); return }
        ch = created
      }
      setChannelId(ch.id)
      // Otwarcie czatu tego zamówienia (np. wejście w zakładkę panelu
      // zamówienia) liczy się jako przeczytanie — inaczej licznik nigdy by
      // się nie zerował, bo ten komponent wcześniej w ogóle go nie znał.
      if (user) await supabase.from('chat_channel_reads').upsert({ channel_id: ch.id, user_id: user.id, last_read_at: new Date().toISOString() })
      setLoading(false)
    })()
  }, [project.id])

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('chat_messages').select(MSG_SELECT).eq('channel_id', channelId).order('created_at', { ascending: false }).limit(LIMIT)
      if (!cancelled) {
        setMessages((data || []).slice().reverse())
        setHasMore((data || []).length === LIMIT)
        setScrollTick(tk => tk + 1)
      }
    })()

    const sub = supabase
      .channel(`project-chat-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        setMessages(prev => (prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]))
        setScrollTick(tk => tk + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        setMessages(prev => prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(sub) }
  }, [channelId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [scrollTick])

  useEffect(() => {
    if (attachFile && isImageFile(attachFile.name)) {
      const url = URL.createObjectURL(attachFile)
      setAttachPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setAttachPreviewUrl(null)
  }, [attachFile])

  useEffect(() => {
    const imgDocs = messages
      .map(m => Array.isArray(m.documents) ? m.documents[0] : m.documents)
      .filter(doc => doc && isImageFile(doc.file_name) && !imgUrls[doc.id])
    if (imgDocs.length === 0) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(imgDocs.map(async doc => {
        const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 60 * 60 * 24)
        return error ? null : [doc.id, data.signedUrl]
      }))
      if (cancelled) return
      const fresh = Object.fromEntries(entries.filter(Boolean))
      if (Object.keys(fresh).length > 0) setImgUrls(prev => ({ ...prev, ...fresh }))
    })()
    return () => { cancelled = true }
  }, [messages])

  const loadOlder = async () => {
    if (!channelId || loadingMore || !messages.length) return
    setLoadingMore(true)
    const oldest = messages[0].created_at
    const { data, error } = await supabase.from('chat_messages').select(MSG_SELECT)
      .eq('channel_id', channelId).lt('created_at', oldest)
      .order('created_at', { ascending: false }).limit(LIMIT)
    setLoadingMore(false)
    if (error) { toast.error(t('Nie udało się wczytać starszych wiadomości: ') + error.message); return }
    const older = (data || []).slice().reverse()
    setHasMore(older.length === LIMIT)
    setMessages(prev => [...older, ...prev])
  }

  const handleSend = async () => {
    if ((!text.trim() && !attachFile) || !channelId) return
    if (attachFile && isFileTooBig(attachFile)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    let attachmentDocId = null
    let content = text.trim() || `📎 ${attachFile?.name || ''}`

    // Excel skategoryzowany jako "Wycena" na czacie zamówienia to jeden z
    // trzech niezależnych sposobów, w jaki zespół CN dostarcza wycenę — plik
    // NIE trafia jako zwykły załącznik/dokument, tylko od razu uruchamia
    // wspólne przyjęcie wyceny (parsowanie, utworzenie wyceny, powiadomienie
    // całego zespołu PL), dokładnie jak w zakładce Wyceny / Plikach projektu.
    if (attachFile && attachCategory === 'Wycena' && isExcelFile(attachFile)) {
      const { data: quotesRows } = await supabase.from('quotes').select('quote_number')
      const result = await createQuoteFromExcelFile(attachFile, project, { id: project.client_id }, (quotesRows || []).map(q => q.quote_number))
      if (!result.ok) { setSending(false); toast.error(t('Nie udało się przyjąć wyceny z Excela: ') + result.error); return }
      const infoNote = `📊 ${t('Wycena przyjęta z Excela')}: ${attachFile.name} (${result.itemCount} ${t('pozycji')}, ${t('powiadomiono')} ${result.notified} ${t('os. z zespołu PL')})`
      content = text.trim() ? `${text.trim()}\n\n${infoNote}` : infoNote
    } else if (attachFile) {
      const path = `${project.client_id}/${crypto.randomUUID()}-${safeFileName(attachFile.name)}`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, attachFile)
      if (upErr) { setSending(false); toast.error('Nie udało się wysłać pliku: ' + upErr.message); return }
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        client_id: project.client_id, project_id: project.id,
        category: attachCategory, file_path: path, file_name: attachFile.name, uploaded_by: user.id, source: 'chat',
      }).select().single()
      if (docErr) { setSending(false); toast.error('Nie udało się zapisać dokumentu: ' + docErr.message); return }
      attachmentDocId = doc.id
    }
    const mentionIds = extractMentions(text, profiles)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: user.id, content,
      attachment_document_id: attachmentDocId,
      mentioned_user_ids: mentionIds.length ? mentionIds : null,
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { toast.error('Nie udało się wysłać wiadomości: ' + error.message); return }
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    if (inserted) { triggerTranslation(inserted); triggerPushNotification(inserted) }
    setText(''); setAttachFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    if (!doc) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 60)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  // Przeciągnij-i-upuść plik wprost na okno czatu tego zamówienia — od razu
  // pyta o kategorię w popupie, z szybką opcją "Brak kategoryzacji".
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) setPendingFile(file)
  }

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie czatu…")}</div>;

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{
        background: dragOver ? C.blight : C.white, border: `1.5px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? C.blue : C.border}`,
        borderRadius: 14, padding: '16px 18px', position: 'relative', transition: 'all .12s ease',
      }}>
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'rgba(37,99,235,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.blue, pointerEvents: 'none', zIndex: 2 }}>
          {t("↓ Upuść plik tutaj")}
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>{t("💬 Czat tego zamówienia")}</div>
      <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 10 }}>
        {hasMore && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <button onClick={loadOlder} disabled={loadingMore}
                style={{ border: `1px solid ${C.border}`, background: C.white, color: C.blue, borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? .6 : 1 }}>
                {loadingMore ? t('Wczytywanie…') : t('Wczytaj starsze wiadomości')}
              </button>
            </div>
          )}
          {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak wiadomości — napisz pierwszą poniżej.")}</div>}
        {messages.map(m => {
          const doc = Array.isArray(m.documents) ? m.documents[0] : m.documents
          return (
            <div key={m.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{m.profiles?.full_name || t("Użytkownik")}</span>
                <span style={{ fontSize: 9.5, color: C.muted }}>{new Date(m.created_at).toLocaleString('pl-PL')}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}><MentionText text={m.content} profiles={profiles} /></div>
              {m.translated_content && m.translated_content !== m.content && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🌐 {m.translated_content}</div>}
              {doc && isImageFile(doc.file_name) && imgUrls[doc.id] && (
                <img src={imgUrls[doc.id]} alt={doc.file_name} onClick={() => handleDownload(doc)}
                  style={{ display: 'block', marginTop: 6, maxWidth: 240, maxHeight: 240, borderRadius: 8, cursor: 'pointer', objectFit: 'cover' }} />
              )}
              {doc && isImageFile(doc.file_name) && !imgUrls[doc.id] && (
                <div style={{ marginTop: 6, width: 160, height: 110, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>{t("Ładowanie zdjęcia…")}</div>
              )}
              {doc && !isImageFile(doc.file_name) && (
                <div onClick={() => handleDownload(doc)} style={{ fontSize: 11, color: C.blue, marginTop: 4, cursor: 'pointer', fontWeight: 600 }}>📎 {doc.file_name} <span style={{ color: C.muted, fontWeight: 400 }}>({t(doc.category)})</span></div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {attachFile && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 11 }}>
          {attachPreviewUrl
            ? <img src={attachPreviewUrl} alt={attachFile.name} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            : <span>📎 {attachFile.name}</span>}
          <select value={attachCategory} onChange={e => setAttachCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10.5 }}>
            {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <span onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.muted }}>{t("✕ usuń")}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f) }} />
        <button onClick={() => fileRef.current?.click()} title={t("Załącz dokument")} style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer' }}>📎</button>
        <MentionInput value={text} onChange={setText} onEnter={handleSend} profiles={profiles}
          placeholder={t("Napisz wiadomość… (@ żeby wspomnieć kogoś)")}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 12 }} />
        <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)}
          style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: (sending || (!text.trim() && !attachFile)) ? .5 : 1 }}>
          {t("Wyślij")}
        </button>
      </div>
      {pendingFile && (
        <AttachCategoryModal file={pendingFile} categories={DOC_CATEGORIES}
          onCancel={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = '' }}
          onConfirm={(cat) => { setAttachFile(pendingFile); setAttachCategory(cat); setPendingFile(null) }} />
      )}
    </div>
  );
}
