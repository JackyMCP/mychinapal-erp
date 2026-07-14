import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB, isImageFile } from '../../lib/files'
import { C } from '../../lib/theme'
import { DOC_CATEGORIES } from './stageDefs'
import { useUI } from '../../lib/ui'
import { triggerTranslation, triggerPushNotification } from '../../lib/translateMessage'

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
  const [imgUrls, setImgUrls] = useState({})
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
  const fileRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      let { data: ch } = await supabase.from('chat_channels').select('id').eq('project_id', project.id).limit(1).maybeSingle()
      if (!ch) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: created, error } = await supabase.from('chat_channels').insert({
          name: project.order_label, client_id: project.client_id, project_id: project.id, created_by: user.id,
        }).select().single()
        if (error) { console.error(error); setLoading(false); return }
        ch = created
      }
      setChannelId(ch.id)
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
    if (attachFile) {
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
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: user.id, content: text.trim() || `📎 ${attachFile?.name || ''}`,
      attachment_document_id: attachmentDocId,
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

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie czatu…")}</div>;

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
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
              <div style={{ fontSize: 12, marginTop: 2 }}>{m.content}</div>
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
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setAttachFile(e.target.files?.[0] || null)} />
        <button onClick={() => fileRef.current?.click()} title={t("Załącz dokument")} style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer' }}>📎</button>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={t("Napisz wiadomość…")}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 12 }} />
        <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)}
          style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: (sending || (!text.trim() && !attachFile)) ? .5 : 1 }}>
          {t("Wyślij")}
        </button>
      </div>
    </div>
  );
}
