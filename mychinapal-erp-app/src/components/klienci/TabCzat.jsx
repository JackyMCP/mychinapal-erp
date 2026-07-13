import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function TabCzat({ clientId, projectIds, onOpenChat }) {
  const {
    t
  } = useLang();

  const [channels, setChannels] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const orParts = [`client_id.eq.${clientId}`]
      if (projectIds && projectIds.length > 0) orParts.push(`project_id.in.(${projectIds.join(',')})`)
      const { data: ch } = await supabase.from('chat_channels').select('id,name').or(orParts.join(','))
      setChannels(ch || [])
      if (ch && ch.length > 0) {
        const ids = ch.map(c => c.id)
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('id, content, translated_content, created_at, profiles(full_name)')
          .in('channel_id', ids)
          .order('created_at', { ascending: false })
          .limit(6)
        setMessages(msgs || [])
      } else {
        setMessages([])
      }
      setLoading(false)
    })()
  }, [clientId, JSON.stringify(projectIds)])

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>;
  if (channels.length === 0) return (
    <div style={{ fontSize: 11, color: C.muted }}>{t(
      "Ten klient nie ma jeszcze kanału na czacie. Utwórz go w module Czat wewnętrzny."
    )}</div>
  );

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {channels.map(c => (
          <div key={c.id} onClick={() => onOpenChat(c.id)}
            style={{ fontSize: 11.5, fontWeight: 600, padding: '7px 13px', borderRadius: 8, background: C.blight, color: C.blue, cursor: 'pointer' }}>💬 {c.name} {t("— otwórz pełny czat")}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>{t("Ostatnie wiadomości")}</div>
      {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak wiadomości.")}</div>}
      {messages.map(m => (
        <div key={m.id} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{m.profiles?.full_name || t("Użytkownik")}</span>
            <span style={{ fontSize: 10, color: C.muted }}>{new Date(m.created_at).toLocaleString('pl-PL')}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 2 }}>{m.content}</div>
          {m.translated_content && m.translated_content !== m.content && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🌐 {m.translated_content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
