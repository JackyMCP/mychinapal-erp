import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB, isImageFile } from '../../lib/files'
import { C } from '../../lib/theme'
import { avatarColor, initials } from './utils'
import { DOC_CATEGORIES } from '../projekty/stageDefs'
import { useUI } from '../../lib/ui'
import { triggerTranslation, triggerPushNotification } from '../../lib/translateMessage'

const LIMIT = 300 // maksymalna liczba ostatnich wiadomości wczytywanych na start (wydajność przy dużej historii)

const MSG_SELECT = '*, profiles(full_name), documents!attachment_document_id(id, file_name, category, file_path)'

export default function TabCzat({ clientId, clientName, projects }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const navigate = useNavigate()
  const [channelId, setChannelId] = useState(null)
  const [projectChannels, setProjectChannels] = useState([])
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
      const { data: { user } } = await supabase.auth.getUser()

      let { data: ch } = await supabase.from('chat_channels').select('id').eq('client_id', clientId).is('project_id', null).limit(1).maybeSingle()
      if (!ch) {
        const { data: created, error } = await supabase.from('chat_channels').insert({
          name: clientName, client_id: clientId, created_by: user.id,
        }).select().single()
        if (error) { console.error(error); setLoading(false); return }
        ch = created
      }
      setChannelId(ch.id)

      // Każde zamówienie tego klienta musi mieć swój kanał czatu, żeby dało
      // się do niego zrobić odnośnik tutaj — jeśli ktoś jeszcze nie otworzył
      // czatu tego zamówienia z panelu Projekty (gdzie normalnie powstaje
      // automatycznie), doszczelniamy to właśnie tutaj.
      if (projects && projects.length > 0) {
        const projectIds = projects.map(p => p.id)
        const { data: existing } = await supabase.from('chat_channels').select('id,name,project_id').in('project_id', projectIds)
        const existingByProject = new Map((existing || []).map(c => [c.project_id, c]))
        const result = []
        for (const p of projects) {
          let pc = existingByProject.get(p.id)
          if (!pc) {
            const { data: created, error } = await supabase.from('chat_channels').insert({
              name: p.order_label, client_id: clientId, project_id: p.id, created_by: user.id,
            }).select('id,name,project_id').single()
            if (error) { console.error(error); continue }
            pc = created
          }
          result.push(pc)
        }
        setProjectChannels(result)
      } else {
        setProjectChannels([])
      }
      setLoading(false)
    })()
  }, [clientId, JSON.stringify((projects || []).map(p => p.id))])

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
      .channel(`client-chat-${channelId}`)
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
      const path = `${clientId}/${crypto.randomUUID()}-${safeFileName(attachFile.name)}`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, attachFile)
      if (upErr) { setSending(false); toast.error('Nie udało się wysłać pliku: ' + upErr.message); return }
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        client_id: clientId, category: attachCategory, file_path: path, file_name: attachFile.name, uploaded_by: user.id, source: 'chat',
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
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div>
      {projectChannels.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{t("Czaty zamówień tego klienta")}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {projectChannels.map(c => (
              <div key={c.id} onClick={() => navigate(`/czat?channel=${c.id}`)} className="ux-hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: C.olight, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📦</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{t("Czat zamówienia →")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 480 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>💬 {t("Czat z")} {clientName}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 2px' }}>
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
            const name = m.profiles?.full_name || t('Użytkownik')
            return (
              <div key={m.id} style={{ display: 'flex', gap: 9, padding: '8px 0' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', background: avatarColor(name) }}>{initials(name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><span style={{ fontSize: 11, fontWeight: 700 }}>{name}</span> <span style={{ fontSize: 9, color: C.muted }}>{new Date(m.created_at).toLocaleString('pl-PL')}</span></div>
                  <div style={{ fontSize: 12.5, marginTop: 1 }}>{m.content}</div>
                  {m.translated_content && m.translated_content !== m.content && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🌐 {m.translated_content}</div>}
                  {doc && isImageFile(doc.file_name) && imgUrls[doc.id] && (
                    <img src={imgUrls[doc.id]} alt={doc.file_name} onClick={() => handleDownload(doc)}
                      style={{ display: 'block', marginTop: 5, maxWidth: 240, maxHeight: 240, borderRadius: 8, cursor: 'pointer', objectFit: 'cover' }} />
                  )}
                  {doc && isImageFile(doc.file_name) && !imgUrls[doc.id] && (
                    <div style={{ marginTop: 5, width: 160, height: 110, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>{t("Ładowanie zdjęcia…")}</div>
                  )}
                  {doc && !isImageFile(doc.file_name) && (
                    <div onClick={() => handleDownload(doc)} style={{ fontSize: 11, color: C.blue, marginTop: 3, cursor: 'pointer', fontWeight: 600 }}>📎 {doc.file_name} <span style={{ color: C.muted, fontWeight: 400 }}>({t(doc.category)})</span></div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        {attachFile && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 11 }}>
            {attachPreviewUrl
              ? <img src={attachPreviewUrl} alt={attachFile.name} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              : <span>📎 {attachFile.name}</span>}
            <select value={attachCategory} onChange={e => setAttachCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10.5 }}>
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
            </select>
            <span onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.muted }}>{t("✕ usuń")}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setAttachFile(e.target.files?.[0] || null)} />
          <button onClick={() => fileRef.current?.click()} title={t("Załącz dokument")} style={{ padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer' }}>📎</button>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={t("Napisz wiadomość do klienta…")}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', fontSize: 12.5 }} />
          <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)}
            style={{ border: 'none', background: C.blue, color: '#fff', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (sending || (!text.trim() && !attachFile)) ? .5 : 1 }}>
            {t("Wyślij")}
          </button>
        </div>
      </div>
    </div>
  )
}
