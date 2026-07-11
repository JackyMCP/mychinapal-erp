import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import NewChannelModal from '../components/czat/NewChannelModal'

const DOC_CATEGORIES = ['Faktury', 'Wyceny', 'Transport', 'Cło']

export default function Czat() {
  const { profile } = useAuth()
  const [channels, setChannels] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [sending, setSending] = useState(false)
  const [attachFile, setAttachFile] = useState(null)
  const [attachCategory, setAttachCategory] = useState(DOC_CATEGORIES[0])
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  const loadChannels = async () => {
    setLoadingChannels(true)
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*, clients(name), projects(order_label)')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setChannels(data || [])
    setLoadingChannels(false)
    if (!activeId && data && data.length > 0) setActiveId(data[0].id)
  }

  useEffect(() => { loadChannels() }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    (async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name), documents(id, file_name, category, file_path)')
        .eq('channel_id', activeId)
        .order('created_at', { ascending: true })
      if (error) console.error(error)
      setMessages(data || [])
    })()

    const sub = supabase
      .channel(`chat_messages_${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeId}` }, async (payload) => {
        const { data } = await supabase.from('chat_messages').select('*, profiles(full_name), documents(id, file_name, category, file_path)').eq('id', payload.new.id).single()
        setMessages(prev => [...prev, data || payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if ((!text.trim() && !attachFile) || !activeId) return
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()

    let attachmentDocId = null
    if (attachFile) {
      if (!active?.client_id) {
        setSending(false)
        alert('Ten kanał nie jest powiązany z klientem — załączniki można wysyłać tylko na kanałach klienta/projektu.')
        return
      }
      const path = `${active.client_id}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, attachFile)
      if (upErr) { setSending(false); alert('Nie udało się wysłać pliku: ' + upErr.message); return }
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        client_id: active.client_id, project_id: active.project_id || null,
        category: attachCategory, file_path: path, file_name: attachFile.name,
        uploaded_by: user.id, source: 'chat',
      }).select().single()
      if (docErr) { setSending(false); alert('Nie udało się zapisać dokumentu: ' + docErr.message); return }
      attachmentDocId = doc.id
    }

    const { error } = await supabase.from('chat_messages').insert({
      channel_id: activeId, sender_id: user.id, content: text.trim() || `📎 ${attachFile?.name || ''}`,
      attachment_document_id: attachmentDocId,
    })
    setSending(false)
    if (error) { console.error(error); alert('Nie udało się wysłać wiadomości: ' + error.message); return }
    setText('')
    setAttachFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 60)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const active = channels.find(c => c.id === activeId)
  const fmtTime = ts => new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Lista kanałów */}
      <div style={{ width: 240, borderRight: `1px solid ${C.border}`, background: C.white, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700 }}>Kanały</div>
          <button onClick={() => setShowNew(true)} style={{ padding: '3px 9px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff' }}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingChannels && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>Ładowanie…</div>}
          {!loadingChannels && channels.length === 0 && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>Brak kanałów — utwórz pierwszy.</div>}
          {channels.map(ch => (
            <div key={ch.id} onClick={() => setActiveId(ch.id)}
              style={{ padding: '10px 16px', cursor: 'pointer', background: activeId === ch.id ? C.blight : 'transparent', borderLeft: `3px solid ${activeId === ch.id ? C.blue : 'transparent'}` }}>
              <div style={{ fontSize: 12.5, fontWeight: activeId === ch.id ? 700 : 500, color: activeId === ch.id ? C.blue : C.text }}>#{ch.name}</div>
              {(ch.clients?.name || ch.projects?.order_label) && (
                <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{ch.clients?.name}{ch.projects?.order_label ? ` · ${ch.projects.order_label}` : ''}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Okno czatu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, minWidth: 0 }}>
        {!active && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
            Wybierz kanał z listy po lewej albo utwórz nowy.
          </div>
        )}
        {active && (
          <>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.white }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>#{active.name}</div>
              {(active.clients?.name || active.projects?.order_label) && (
                <div style={{ fontSize: 10.5, color: C.muted }}>{active.clients?.name}{active.projects?.order_label ? ` · ${active.projects.order_label}` : ''}</div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20 }}>Brak wiadomości — napisz pierwszą.</div>}
              {messages.map(m => {
                const mine = m.sender_id === profile?.id
                return (
                  <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                    {!mine && <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{m.profiles?.full_name || 'Nieznany'}</div>}
                    <div style={{ background: mine ? C.blue : C.white, color: mine ? '#fff' : C.text, border: mine ? 'none' : `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.content}
                      {m.documents && (
                        <div onClick={() => handleDownload(m.documents)} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '5px 8px', borderRadius: 6, background: mine ? 'rgba(255,255,255,.15)' : C.bg, fontSize: 11 }}>
                          📎 <span style={{ textDecoration: 'underline' }}>{m.documents.file_name}</span>
                          <span style={{ fontSize: 9, opacity: 0.75 }}>({m.documents.category})</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2, textAlign: mine ? 'right' : 'left' }}>{fmtTime(m.created_at)}</div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.white }}>
              {attachFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: C.bg, borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 11.5 }}>📎 {attachFile.name}</span>
                  <select value={attachCategory} onChange={e => setAttachCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none' }}>
                    {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 11, color: C.muted }}>✕ usuń</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => setAttachFile(e.target.files?.[0] || null)} />
                <button onClick={() => fileInputRef.current?.click()} title={active?.client_id ? 'Załącz plik' : 'Załączniki dostępne tylko na kanałach klienta/projektu'} disabled={!active?.client_id}
                  style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, cursor: active?.client_id ? 'pointer' : 'not-allowed', background: 'transparent', color: active?.client_id ? C.text2 : C.muted, opacity: active?.client_id ? 1 : 0.5 }}>
                  📎
                </button>
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Napisz wiadomość…" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, outline: 'none' }} />
                <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: (sending || (!text.trim() && !attachFile)) ? 0.5 : 1 }}>
                  Wyślij
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showNew && <NewChannelModal onClose={() => setShowNew(false)} onCreated={(ch) => { setShowNew(false); loadChannels(); setActiveId(ch.id) }} />}
    </div>
  )
}
