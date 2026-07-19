import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../lib/ui'
import { C } from '../lib/theme'
import PageHeader from '../components/PageHeader'
import useIsMobile from '../lib/useIsMobile'

// Moduł Poczta — każdy pracownik łączy WŁASNĄ skrzynkę Outlook (Microsoft
// Graph OAuth, patrz outlook-oauth-start/outlook-oauth-callback). Nowe maile
// w Odebranych trafiają tu na żywo przez webhook Graph -> email_messages,
// a Supabase Realtime pcha je od razu do tego widoku bez odświeżania strony.
// Skrzynka jest prywatna — nikt (nawet zarząd) nie widzi cudzej poczty,
// dokładnie jak w prawdziwym Outlooku.

const FOLDERS = [
  { key: 'inbox', label: 'Odebrane', icon: '📥' },
  { key: 'sentitems', label: 'Wysłane', icon: '📤' },
]

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function Poczta() {
  const { t } = useLang()
  const { session } = useAuth()
  const { toast } = useUI()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [account, setAccount] = useState(null)
  const [messages, setMessages] = useState([])
  const [folder, setFolder] = useState('inbox')
  const [search, setSearch] = useState('')
  const [selectedThreadId, setSelectedThreadId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState({ to: '', cc: '', subject: '', body: '' })
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  // Powiadomienie po powrocie z logowania Microsoft (outlook-oauth-callback
  // przekierowuje z powrotem na /poczta?connected=1 albo ?outlook_error=...)
  useEffect(() => {
    const connected = searchParams.get('connected')
    const err = searchParams.get('outlook_error')
    if (connected) { toast.success(t('Konto Outlook połączone ✓')); setSearchParams({}, { replace: true }) }
    if (err) { toast.error(t('Nie udało się połączyć konta Outlook: ') + err); setSearchParams({}, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    if (!session?.user?.id) return
    setLoading(true)
    const { data: acc } = await supabase.from('email_accounts').select('*').eq('user_id', session.user.id).maybeSingle()
    setAccount(acc || null)
    if (acc) {
      const { data: msgs, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('email_account_id', acc.id)
        .order('received_at', { ascending: false })
        .limit(500)
      if (error) toast.error(t('Nie udało się wczytać poczty: ') + error.message)
      setMessages(msgs || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [session?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Na żywo: nowe/zmienione wiadomości (webhook Graph -> DB) pojawiają się
  // tu bez odświeżania strony.
  useEffect(() => {
    if (!account?.id) return
    const channel = supabase.channel(`email-account-${account.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `email_account_id=eq.${account.id}` }, (payload) => {
        setMessages(prev => {
          if (payload.eventType === 'DELETE') return prev.filter(m => m.id !== payload.old.id)
          const next = prev.filter(m => m.id !== payload.new.id)
          return [payload.new, ...next].sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [account?.id])

  const handleConnect = async () => {
    setConnecting(true)
    // Uwaga: celowo BEZ { method: 'GET' } — supabase-js (2.45.4) w tej
    // konfiguracji rzuca błędem klienta przy jawnym GET (fetch nie akceptuje
    // body na GET/HEAD), więc żądanie nigdy nie docierało do Supabase (brak
    // wpisu w logach edge-function). Domyślny POST działa identycznie, bo
    // outlook-oauth-start i tak nie rozróżnia metody (poza OPTIONS).
    const { data, error } = await supabase.functions.invoke('outlook-oauth-start')
    setConnecting(false)
    if (error || !data?.ok) {
      console.error('outlook-oauth-start failed:', error, data)
      toast.error(t('Nie udało się rozpocząć łączenia z Outlookiem.'))
      return
    }
    window.location.href = data.url
  }

  const folderMessages = useMemo(() => messages.filter(m => (m.folder || 'inbox') === folder), [messages, folder])

  // Grupowanie w wątki (jak w Outlooku) — jedna pozycja na liście na
  // conversation_id, pokazuje najnowszą wiadomość z wątku.
  const threads = useMemo(() => {
    const byThread = new Map()
    for (const m of folderMessages) {
      const key = m.conversation_id || m.id
      const cur = byThread.get(key)
      if (!cur || new Date(m.received_at) > new Date(cur.latest.received_at)) {
        byThread.set(key, { key, latest: m, all: [...(cur?.all || []), m] })
      } else {
        byThread.set(key, { ...cur, all: [...cur.all, m] })
      }
    }
    let list = Array.from(byThread.values())
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(th =>
        (th.latest.subject || '').toLowerCase().includes(q) ||
        (th.latest.from_name || '').toLowerCase().includes(q) ||
        (th.latest.from_address || '').toLowerCase().includes(q) ||
        (th.latest.body_preview || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => new Date(b.latest.received_at) - new Date(a.latest.received_at))
    return list
  }, [folderMessages, search])

  const selectedThread = threads.find(th => th.key === selectedThreadId) || null
  const selectedMessages = selectedThread
    ? [...selectedThread.all].sort((a, b) => new Date(a.received_at) - new Date(b.received_at))
    : []
  const lastInboundMessage = [...selectedMessages].reverse().find(m => m.direction === 'inbound') || selectedMessages[selectedMessages.length - 1]

  const openThread = async (th) => {
    setSelectedThreadId(th.key)
    setReplyBody('')
    const unread = th.all.filter(m => m.direction === 'inbound' && !m.is_read)
    if (unread.length) {
      await supabase.from('email_messages').update({ is_read: true }).in('id', unread.map(m => m.id))
      setMessages(prev => prev.map(m => unread.some(u => u.id === m.id) ? { ...m, is_read: true } : m))
    }
  }

  const handleSendCompose = async () => {
    const to = compose.to.split(',').map(s => s.trim()).filter(Boolean)
    const cc = compose.cc.split(',').map(s => s.trim()).filter(Boolean)
    if (!to.length || !compose.subject.trim()) { toast.error(t('Podaj odbiorcę i temat.')); return }
    setSending(true)
    const { data, error } = await supabase.functions.invoke('outlook-send-mail', {
      body: { to, cc, subject: compose.subject, bodyHtml: compose.body.replace(/\n/g, '<br/>') },
    })
    setSending(false)
    if (error || !data?.ok) { toast.error(t('Nie udało się wysłać wiadomości.')); return }
    toast.success(t('Wiadomość wysłana ✓'))
    setComposeOpen(false)
    setCompose({ to: '', cc: '', subject: '', body: '' })
  }

  const handleReply = async (replyAll) => {
    if (!lastInboundMessage || !replyBody.trim()) return
    setSending(true)
    const { data, error } = await supabase.functions.invoke('outlook-send-mail', {
      body: {
        replyToMessageId: lastInboundMessage.graph_message_id,
        replyAll,
        bodyHtml: replyBody.replace(/\n/g, '<br/>'),
        subject: lastInboundMessage.subject,
        to: [lastInboundMessage.from_address].filter(Boolean),
        conversationId: lastInboundMessage.conversation_id,
      },
    })
    setSending(false)
    if (error || !data?.ok) { toast.error(t('Nie udało się wysłać odpowiedzi.')); return }
    toast.success(t('Odpowiedź wysłana ✓'))
    setReplyBody('')
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('Poczta')} />
        <div style={{ padding: '16px 22px', fontSize: 12, color: C.muted }}>{t('Wczytywanie…')}</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div>
        <PageHeader title={t('Poczta')} />
        <div style={{ padding: '40px 22px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 36, maxWidth: 460, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t('Połącz swoją pocztę Outlook')}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
              {t('Zaloguj się swoim firmowym kontem Microsoft, żeby odbierać i wysyłać maile bezpośrednio z tej aplikacji — na żywo, tak jak w Outlooku.')}
            </div>
            <button onClick={handleConnect} disabled={connecting}
              style={{ padding: '11px 22px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', opacity: connecting ? .6 : 1 }}>
              {connecting ? t('Łączenie…') : t('🔗 Połącz z Outlook')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showList = !isMobile || !selectedThreadId
  const showReading = !isMobile || !!selectedThreadId

  return (
    <div>
      <PageHeader title={t('Poczta')} subtitle={account.ms_account_email} />
      <div style={{ display: 'flex', gap: 14, padding: '16px 22px', height: 'calc(100vh - 150px)', boxSizing: 'border-box' }}>
        {/* Kolumna: foldery */}
        {!isMobile && (
          <div style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => setComposeOpen(true)}
              style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {t('✏️ Nowa wiadomość')}
            </button>
            {FOLDERS.map(f => {
              const count = messages.filter(m => (m.folder || 'inbox') === f.key && m.direction === 'inbound' && !m.is_read).length
              return (
                <div key={f.key} onClick={() => { setFolder(f.key); setSelectedThreadId(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                    background: folder === f.key ? C.blight : 'transparent', color: folder === f.key ? C.blue : C.text2, fontSize: 12.5, fontWeight: folder === f.key ? 700 : 500,
                  }}>
                  <span>{f.icon}</span>
                  <span style={{ flex: 1 }}>{t(f.label)}</span>
                  {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: C.red, color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Kolumna: lista wątków */}
        {showList && (
          <div style={{ width: isMobile ? '100%' : 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('🔍 Szukaj w poczcie…')}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, outline: 'none', boxSizing: 'border-box' }} />
              {isMobile && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {FOLDERS.map(f => (
                    <button key={f.key} onClick={() => { setFolder(f.key); setSelectedThreadId(null) }}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: `1px solid ${folder === f.key ? C.blue : C.border}`, background: folder === f.key ? C.blight : 'transparent', color: folder === f.key ? C.blue : C.text2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {f.icon} {t(f.label)}
                    </button>
                  ))}
                  <button onClick={() => setComposeOpen(true)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>✏️</button>
                </div>
              )}
            </div>
            <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
              {threads.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 11.5 }}>{t('Brak wiadomości.')}</div>
              )}
              {threads.map(th => {
                const unread = th.all.some(m => m.direction === 'inbound' && !m.is_read)
                const active = th.key === selectedThreadId
                return (
                  <div key={th.key} onClick={() => openThread(th)}
                    style={{
                      padding: '11px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                      background: active ? C.blight : 'transparent',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: unread ? 800 : 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                        {th.latest.direction === 'outbound' ? (th.latest.to_addresses || []).map(a => a.address).join(', ') || t('(brak odbiorcy)') : (th.latest.from_name || th.latest.from_address || t('(nieznany nadawca)'))}
                      </span>
                      <span style={{ fontSize: 9.5, color: C.muted, flexShrink: 0 }}>{timeLabel(th.latest.received_at)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: unread ? 700 : 500, color: C.text2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.latest.subject || t('(brak tematu)')}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.latest.body_preview || stripHtml(th.latest.body_html).slice(0, 100)}
                    </div>
                    {unread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue, marginTop: 6 }} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Kolumna: podgląd wątku */}
        {showReading && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {!selectedThread ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
                {t('Wybierz wiadomość z listy.')}
              </div>
            ) : (
              <>
                {isMobile && (
                  <div onClick={() => setSelectedThreadId(null)} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{t('← Wróć do listy')}</div>
                )}
                <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{selectedMessages[0]?.subject || t('(brak tematu)')}</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
                  {selectedMessages.map(m => (
                    <div key={m.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                            {m.direction === 'outbound' ? (account.ms_account_email) : (m.from_name || m.from_address)}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.muted }}>
                            {t('do')}: {(m.to_addresses || []).map(a => a.address).join(', ') || '—'}
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, color: C.muted, flexShrink: 0 }}>{new Date(m.received_at).toLocaleString('pl-PL')}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: m.body_html || m.body_preview || '' }} />
                    </div>
                  ))}
                </div>
                {folder === 'inbox' && (
                  <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}` }}>
                    <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder={t('Napisz odpowiedź…')}
                      rows={3}
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => handleReply(false)} disabled={sending || !replyBody.trim()}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (sending || !replyBody.trim()) ? .5 : 1 }}>
                        {t('↩ Odpowiedz')}
                      </button>
                      <button onClick={() => handleReply(true)} disabled={sending || !replyBody.trim()}
                        style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (sending || !replyBody.trim()) ? .5 : 1 }}>
                        {t('↩↩ Odpowiedz wszystkim')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {composeOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setComposeOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 520, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t('Nowa wiadomość')}</div>
            <input value={compose.to} onChange={e => setCompose(c => ({ ...c, to: e.target.value }))} placeholder={t('Do (adresy oddzielone przecinkiem)')}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
            <input value={compose.cc} onChange={e => setCompose(c => ({ ...c, cc: e.target.value }))} placeholder={t('DW (opcjonalnie)')}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
            <input value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))} placeholder={t('Temat')}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
            <textarea value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))} placeholder={t('Treść wiadomości…')} rows={8}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setComposeOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
              <button onClick={handleSendCompose} disabled={sending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
                {sending ? t('Wysyłanie…') : t('Wyślij')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
