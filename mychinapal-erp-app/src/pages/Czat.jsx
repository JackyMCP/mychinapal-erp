import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { safeFileName } from '../lib/files'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import NewChannelModal from '../components/czat/NewChannelModal'
import VoiceChannel from '../components/dashboard/VoiceChannel'
import { DOC_CATEGORIES } from '../components/projekty/stageDefs'
const MSG_SELECT = '*, profiles(full_name), documents!attachment_document_id(id, file_name, category, file_path, created_at)'

const TYPE_STYLE = {
  ogolny:  { icon: '💬', color: C.blue,   bg: C.blight, label: 'Ogólny' },
  klient:  { icon: '🧑‍💼', color: C.purple, bg: C.plight, label: 'Klient' },
  projekt: { icon: '📦', color: C.orange, bg: C.olight, label: 'Projekt' },
  zarzad:  { icon: '👑', color: C.navy,   bg: 'rgba(10,22,40,.08)', label: 'Zarząd' },
}
function channelType(ch) {
  if (ch.project_id) return 'projekt'
  if (ch.client_id) return 'klient'
  if (ch.zarzad_only) return 'zarzad'
  return 'ogolny'
}

const smallBtn = (st, active) => ({
  padding: '6px 11px', borderRadius: 8, border: `1px solid ${st.color}`, fontSize: 10.5, fontWeight: 700,
  cursor: 'pointer', background: active ? st.bg : 'transparent', color: st.color, whiteSpace: 'nowrap',
  transition: 'all .12s ease',
})

export default function Czat() {
  const { t } = useLang()
  const { profile, isZarzad } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [channels, setChannels] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [sending, setSending] = useState(false)
  const [attachFile, setAttachFile] = useState(null)
  const [attachCategory, setAttachCategory] = useState(DOC_CATEGORIES[0])
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  const loadChannels = async () => {
    setLoadingChannels(true)
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*, clients(name), projects(order_label)')
      .order('created_at', { ascending: false })
    if (error) { console.error(error); alert('Nie udało się wczytać kanałów: ' + error.message) }
    setChannels(data || [])
    setLoadingChannels(false)
    const wanted = searchParams.get('channel')
    if (wanted && data && data.some(c => c.id === wanted)) {
      setActiveId(wanted)
    } else if (!activeId && data && data.length > 0) {
      setActiveId(data[0].id)
    }
  }

  useEffect(() => { loadChannels() }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let cancelled = false
    setShowFiles(false)
    setRenaming(false)

    ;(async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MSG_SELECT)
        .eq('channel_id', activeId)
        .order('created_at', { ascending: true })
      if (error) { console.error(error); alert('Nie udało się wczytać historii wiadomości: ' + error.message); return }
      if (!cancelled) setMessages(data || [])
    })()

    const sub = supabase
      .channel(`chat_messages_${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeId}` }, async (payload) => {
        const { data, error } = await supabase.from('chat_messages').select(MSG_SELECT).eq('id', payload.new.id).single()
        if (error) { console.error(error); return }
        const row = data || payload.new
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeId}` }, (payload) => {
        // np. dotarło tłumaczenie z funkcji translate-chat-message
        setMessages(prev => prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(sub) }
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
      const path = `${active.client_id}/${crypto.randomUUID()}-${safeFileName(attachFile.name)}`
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

    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: activeId, sender_id: user.id, content: text.trim() || `📎 ${attachFile?.name || ''}`,
      attachment_document_id: attachmentDocId,
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { console.error(error); alert('Nie udało się wysłać wiadomości: ' + error.message); return }
    // pokaż wiadomość natychmiast, niezależnie od tego czy zdarzenie realtime dotrze
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    setText('')
    setAttachFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    if (!doc) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 60)
    if (error) { alert('Nie udało się pobrać pliku: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleRenameStart = () => { setRenameValue(active.name); setRenaming(true) }
  const handleRenameSave = async () => {
    if (!renameValue.trim() || renameValue.trim() === active.name) { setRenaming(false); return }
    setRenameSaving(true)
    const { data, error } = await supabase.from('chat_channels').update({ name: renameValue.trim() }).eq('id', active.id).select()
    setRenameSaving(false)
    if (error) { alert('Nie udało się zmienić nazwy: ' + error.message); return }
    if (!data || data.length === 0) { alert('Brak uprawnień do zmiany nazwy tego kanału — może to zrobić tylko Zarząd albo osoba, która utworzyła kanał.'); return }
    setRenaming(false)
    loadChannels()
  }

  const active = channels.find(c => c.id === activeId)
  const activeType = active ? channelType(active) : 'ogolny'
  const activeStyle = TYPE_STYLE[activeType]
  const canRename = active && (isZarzad || active.created_by === profile?.id)
  const channelFiles = messages
    .map(m => Array.isArray(m.documents) ? m.documents[0] : m.documents)
    .filter(Boolean)
  const fmtTime = ts => new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <style>{`
        @keyframes czMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes czTileIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes czBarShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .cz-msg { animation: czMsgIn .22s ease both; }
        .cz-tile { animation: czTileIn .18s ease both; }
        .cz-tile:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.07); }
      `}</style>
      {/* Lista kanałów */}
      <div style={{ width: 252, borderRight: `1px solid ${C.border}`, background: C.white, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${C.navy}, ${C.blue}, ${C.purple}, ${C.navy})`, backgroundSize: '300% 100%', animation: 'czBarShift 6s ease infinite' }} />
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700 }}>{t("Kanały")}</div>
          <button onClick={() => setShowNew(true)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff' }}>+ {t("Nowy")}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loadingChannels && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>}
          {!loadingChannels && channels.length === 0 && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>{t("Brak kanałów — utwórz pierwszy.")}</div>}
          {channels.map((ch, i) => {
            const type = channelType(ch)
            const st = TYPE_STYLE[type]
            const isActive = activeId === ch.id
            return (
              <div key={ch.id} className="cz-tile" onClick={() => setActiveId(ch.id)}
                style={{
                  margin: '0 0 6px', padding: '9px 11px', borderRadius: 11, cursor: 'pointer',
                  background: isActive ? st.bg : C.white, border: `1px solid ${isActive ? st.color : C.border}`,
                  boxShadow: isActive ? `0 3px 12px ${st.color}22` : '0 1px 2px rgba(0,0,0,.03)',
                  transition: 'all .15s ease', animationDelay: `${Math.min(i, 8) * 25}ms`,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, flexShrink: 0, background: isActive ? '#fff' : st.bg, color: st.color }}>{st.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 600, color: isActive ? st.color : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                    <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.clients?.name || ch.projects?.order_label ? `${ch.clients?.name || ''}${ch.projects?.order_label ? ` · ${ch.projects.order_label}` : ''}` : t(st.label)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Okno czatu */}
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, minWidth: 0 }}>
          {!active && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
              {t("Wybierz kanał z listy po lewej albo utwórz nowy.")}
            </div>
          )}
          {active && (
            <>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.white }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, background: activeStyle.bg, color: activeStyle.color }}>{activeStyle.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      {renaming ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameSave(); if (e.key === 'Escape') setRenaming(false) }}
                            style={{ fontSize: 14, fontWeight: 700, border: `1px solid ${activeStyle.color}`, borderRadius: 6, padding: '3px 8px', fontFamily: "'Syne',sans-serif", outline: 'none' }} />
                          <span onClick={handleRenameSave} style={{ cursor: 'pointer', fontSize: 13, color: C.green, fontWeight: 700 }}>{renameSaving ? '…' : '✓'}</span>
                          <span onClick={() => setRenaming(false)} style={{ cursor: 'pointer', fontSize: 13, color: C.muted }}>✕</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{active.name}</div>
                          {canRename && <span onClick={handleRenameStart} title={t('Zmień nazwę')} style={{ cursor: 'pointer', fontSize: 11.5, color: C.muted }}>✏️</span>}
                        </div>
                      )}
                      {(active.clients?.name || active.projects?.order_label) && (
                        <div style={{ fontSize: 10.5, color: C.muted }}>{active.clients?.name}{active.projects?.order_label ? ` · ${active.projects.order_label}` : ''}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                    {active.client_id && (
                      <button onClick={() => navigate(`/klienci?client=${active.client_id}`)} style={smallBtn(TYPE_STYLE.klient, false)}>{t('→ Panel klienta')}</button>
                    )}
                    {active.project_id && (
                      <button onClick={() => navigate(`/projekty?project=${active.project_id}`)} style={smallBtn(TYPE_STYLE.projekt, false)}>{t('→ Panel zamówienia')}</button>
                    )}
                    <button onClick={() => setShowFiles(f => !f)} style={smallBtn({ color: C.blue, bg: C.blight }, showFiles)}>
                      {t('📎 Pliki')}{channelFiles.length > 0 ? ` (${channelFiles.length})` : ''}
                    </button>
                  </div>
                </div>
                <VoiceChannel roomId={`voice-${active.id}`} currentUserId={profile?.id} currentUserName={profile?.full_name || 'Użytkownik'} accentColor={activeStyle.color} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20 }}>{t("Brak wiadomości — napisz pierwszą.")}</div>}
                {messages.map(m => {
                  const mine = m.sender_id === profile?.id
                  const doc = Array.isArray(m.documents) ? m.documents[0] : m.documents
                  return (
                    <div key={m.id} className="cz-msg" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                      {!mine && <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{m.profiles?.full_name || t("Nieznany")}</div>}
                      <div style={{ background: mine ? activeStyle.color : C.white, color: mine ? '#fff' : C.text, border: mine ? 'none' : `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.content}
                        {m.translated_content && m.translated_content !== m.content && (
                          <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${mine ? 'rgba(255,255,255,.25)' : C.border}`, fontSize: 11.5, fontStyle: 'italic', opacity: 0.85 }}>
                            🌐 {m.translated_content}
                          </div>
                        )}
                        {doc && (
                          <div onClick={() => handleDownload(doc)} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '5px 8px', borderRadius: 6, background: mine ? 'rgba(255,255,255,.15)' : C.bg, fontSize: 11 }}>
                            📎 <span style={{ textDecoration: 'underline' }}>{doc.file_name}</span>
                            <span style={{ fontSize: 9, opacity: 0.75 }}>({t(doc.category)})</span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2, textAlign: mine ? 'right' : 'left' }}>{fmtTime(m.created_at)}</div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.white }}>
                {attachFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: C.bg, borderRadius: 8, padding: '6px 10px' }}>
                    <span style={{ fontSize: 11.5 }}>📎 {attachFile.name}</span>
                    <select value={attachCategory} onChange={e => setAttachCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none' }}>
                      {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                    </select>
                    <span onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 11, color: C.muted }}>{t("✕ usuń")}</span>
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
                    placeholder={t("Napisz wiadomość…")} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, outline: 'none' }} />
                  <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: activeStyle.color, color: '#fff', opacity: (sending || (!text.trim() && !attachFile)) ? 0.5 : 1 }}>
                    {t("Wyślij")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {active && showFiles && (
          <div style={{ width: 260, borderLeft: `1px solid ${C.border}`, background: C.white, overflowY: 'auto', padding: '16px', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>📎 {t("Pliki na tym kanale")}</div>
            {channelFiles.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak plików — załączniki wysłane na tym czacie pojawią się tutaj.")}</div>}
            {channelFiles.map(doc => (
              <div key={doc.id} onClick={() => handleDownload(doc)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <span style={{ fontSize: 16 }}>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
                  <div style={{ fontSize: 9.5, color: C.muted }}>{t(doc.category)} · {new Date(doc.created_at).toLocaleDateString('pl-PL')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showNew && <NewChannelModal onClose={() => setShowNew(false)} onCreated={(ch) => { setShowNew(false); loadChannels(); setActiveId(ch.id) }} />}
    </div>
  );
}
