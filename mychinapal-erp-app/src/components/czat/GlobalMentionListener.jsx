import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useUI } from '../../lib/ui'
import { playMentionSound } from '../../lib/notifySound'

// Nasłuch @wzmianek działający NIEZALEŻNIE od tego, która strona aplikacji
// jest aktualnie otwarta — montowany raz na poziomie Shell (App.jsx), a nie
// wewnątrz Czat.jsx, żeby dźwięk + powiadomienie w aplikacji zadziałały
// nawet gdy użytkownik jest np. w Magazynie albo w Kasa & Bank.
// Prawdziwe powiadomienia push (ekran blokady telefonu / poza otwartą kartą
// przeglądarki) obsługuje osobno edge function send-chat-push — ten
// komponent odpowiada za "na żywo, w aplikacji" (dźwięk + toast).
export default function GlobalMentionListener() {
  const { profile } = useAuth()
  const { toast } = useUI()
  const navigate = useNavigate()
  const myIdRef = useRef(null)

  useEffect(() => { myIdRef.current = profile?.id || null }, [profile?.id])

  useEffect(() => {
    const sub = supabase
      .channel('chat_mentions_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const row = payload.new
        const myId = myIdRef.current
        if (!row || !myId || row.sender_id === myId) return
        if (!Array.isArray(row.mentioned_user_ids) || !row.mentioned_user_ids.includes(myId)) return
        playMentionSound()
        const { data: ch } = await supabase.from('chat_channels').select('id,name').eq('id', row.channel_id).maybeSingle()
        toast.success(
          `Wspomniano Cię${ch?.name ? ` na #${ch.name}` : ''}: ${String(row.content || '').slice(0, 90)}`,
          { icon: '🔔', onClick: () => navigate(`/czat?channel=${row.channel_id}`) }
        )
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  return null
}
