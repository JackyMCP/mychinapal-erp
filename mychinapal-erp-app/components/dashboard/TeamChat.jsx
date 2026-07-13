import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'
import VoiceChannel from './VoiceChannel'
import { useUI } from '../../lib/ui'

const LIMIT = 300 // maksymalna liczba ostatnich wiadomości wczytywanych na start (wydajność przy dużej historii)

const MSG_SELECT = '*, profiles(full_name)'

export default function TeamChat({ channelName, zarzadOnly, currentUserId, currentUserName, accentColor }) {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()

  const [channelId, setChannelId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
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
      const { data } = await supabase.from('chat_messages').select(MSG_SELECT).eq('channel_id', channelId).order('created_at', { ascending: false }).limit(LIMIT)
      if (!cancelled) {
        setMessages((data || []).slice().reverse())
        setHasMore((data || []).length === LIMIT)
        setScrollTick(tk => tk + 1)
      }
    })()
    const sub = supabase.channel(`team-chat-${channelId}`)
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
    if (!text.trim() || !channelId) return
    setSending(true)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: currentUserId, content: text.trim(),
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { toast.error('Nie udało się wysłać wiadomości: ' + error.message); return }
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    setText('')
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>💬 {channelName}</div>
      {channelId && <VoiceChannel roomId={`voice-${channelId}`} currentUserId={currentUserId} currentUserName={currentUserName || 'Użytkownik'} accentColor={accentColor} chatChannelId={channelId} />}
      {loading ? <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div> : (
        <>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
            {hasMore && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <button onClick={loadOlder} disabled={loadingMore}
                style={{ border: `1px solid ${C.border}`, background: C.white, color: C.blue, borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? .6 : 1 }}>
                {loadingMore ? t('Wczytywanie…') : t('Wczytaj starsze wiadomości')}
              </button>
            </div>
          )}
          {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak wiadomości — napisz pierwszą.")}</div>}
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(m.profiles?.full_name || '') }}>{initials(m.profiles?.full_name || '?')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{m.profiles?.full_name || t("Użytkownik")}</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{m.content}</div>
                  {m.translated_content && m.translated_content !== m.content && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🌐 {m.translated_content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder={t("Napisz wiadomość…")}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }} />
            <button onClick={handleSend} disabled={sending || !text.trim()}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: accentColor || C.blue, color: '#fff', opacity: (sending || !text.trim()) ? .5 : 1 }}>
              {t("Wyślij")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
