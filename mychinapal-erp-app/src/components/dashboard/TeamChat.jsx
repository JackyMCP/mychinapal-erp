import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

const MSG_SELECT = '*, profiles(full_name)'

export default function TeamChat({ channelName, zarzadOnly, currentUserId, accentColor }) {
  const [channelId, setChannelId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      let { data: ch } = await supabase.from('chat_channels').select('id').eq('name', channelName).eq('zarzad_only', zarzadOnly).is('client_id', null).is('project_id', null).limit(1).maybeSingle()
      if (!ch) {
        const { data: created, error } = await supabase.from('chat_channels').insert({ name: channelName, zarzad_only: zarzadOnly, created_by: currentUserId }).select().single()
        if (error) { console.error(error); setLoading(false); return }
        ch = created
      }
      setChannelId(ch.id)
      setLoading(false)
    })()
  }, [channelName, zarzadOnly])

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('chat_messages').select(MSG_SELECT).eq('channel_id', channelId).order('created_at')
      if (!cancelled) setMessages(data || [])
    })()
    const sub = supabase.channel(`team-chat-${channelId}`)
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
    if (!text.trim() || !channelId) return
    setSending(true)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: currentUserId, content: text.trim(),
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { alert('Nie udało się wysłać wiadomości: ' + error.message); return }
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    setText('')
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>💬 {channelName}</div>
      {loading ? <div style={{ fontSize: 11, color: C.muted }}>Ładowanie…</div> : (
        <>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
            {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>Brak wiadomości — napisz pierwszą.</div>}
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(m.profiles?.full_name || '') }}>{initials(m.profiles?.full_name || '?')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{m.profiles?.full_name || 'Użytkownik'}</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{m.content}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Napisz wiadomość…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }} />
            <button onClick={handleSend} disabled={sending || !text.trim()}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: accentColor || C.blue, color: '#fff', opacity: (sending || !text.trim()) ? .5 : 1 }}>
              Wyślij
            </button>
          </div>
        </>
      )}
    </div>
  )
}
