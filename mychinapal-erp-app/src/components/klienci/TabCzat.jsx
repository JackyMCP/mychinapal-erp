import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from './utils'
import { DOC_CATEGORIES } from '../projekty/stageDefs'

const MSG_SELECT = '*, profiles(full_name), documents!attachment_document_id(id, file_name, category, file_path)'

export default function TabCzat({ clientId, clientName, projectIds }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [channelId, setChannelId] = useState(null)
  const [projectChannels, setProjectChannels] = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attachFile, setAttachFile] = useState(null)
  const [attachCategory, setAttachCategory] = useState(DOC_CATEGORIES[0])
  const fileRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      let { data: ch } = await supabase.from('chat_channels').select('id').eq('client_id', clientId).is('project_id', null).limit(1).maybeSingle()
      if (!ch) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: created, error } = await supabase.from('chat_channels').insert({
          name: clientName, client_id: clientId, created_by: user.id,
        }).select().single()
        if (error) { console.error(error); setLoading(false); return }
        ch = created
      }
      setChannelId(ch.id)

      if (projectIds && projectIds.length > 0) {
        const { data: pch } = await supabase.from('chat_channels').select('id,name,project_id').in('project_id', projectIds)
        setProjectChannels(pch || [])
      } else {
        setProjectChannels([])
      }
      setLoading(false)
    })()
  }, [clientId, JSON.stringify(projectIds)])

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('chat_messages').select(MSG_SELECT).eq('channel_id', channelId).order('created_at')
      if (!cancelled) setMessages(data || [])
    })()

    const sub = supabase
      .channel(`client-chat-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        setMessages(prev => (prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        setMessages(prev => prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(sub) }
  }, [channelId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const handleSend = async () => {
    if ((!text.trim() && !attachFile) || !channelId) return
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    let attachmentDocId = null
    if (attachFile) {
      const path = `${clientId}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, attachFile)
      if (upErr) { setSending(false); alert('Nie udało się wysłać pliku: ' + upErr.message); return }
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        client_id: clientId, category: attachCategory, file_path: path, file_name: attachFile.name, uploaded_by: user.id, source: 'chat',
      }).select().single()
      if (docErr) { setSending(false); alert('Nie udało się zapisać dokumentu: ' + docErr.message); return }
      attachmentDocId = doc.id
    }
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: user.id, content: text.trim() || `📎 ${attachFile?.name || ''}`,
      attachment_document_id: attachmentDocId,
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { alert('Nie udało się wysłać wiadomości: ' + error.message); return }
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    setText(''); setAttachFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    if (!doc) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div>
      {projectChannels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {projectChannels.map(c => (
            <div key={c.id} onClick={() => navigate(`/czat?channel=${c.id}`)}
              style={{ fontSize: 11, fontWeight: 600, padding: '7px 13px', borderRadius: 8, background: C.blight, color: C.blue, cursor: 'pointer' }}>💬 {c.name} {t("— czat tego zamówienia")}</div>
          ))}
        </div>
      )}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 480 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>💬 {t("Czat z")} {clientName}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 2px' }}>
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
                  {doc && (
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
            <span>📎 {attachFile.name}</span>
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
