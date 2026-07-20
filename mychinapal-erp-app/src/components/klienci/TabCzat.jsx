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
import AttachCategoryModal from '../ui/AttachCategoryModal'
import MentionInput from '../czat/MentionInput'
import MentionText from '../czat/MentionText'
import UnreadBadge from '../czat/UnreadBadge'
import { extractMentions } from '../../lib/mentions'
import { detectQuoteValue, saveQuoteFile } from '../../lib/quoteIntake'
import QuoteValueModal from '../wyceny/QuoteValueModal'
import ForwardModal from '../ForwardModal'
import ForwardIconButton from '../ui/ForwardIconButton'
import FilePreviewModal from '../ui/FilePreviewModal'
import AttachmentCard from '../ui/AttachmentCard'

const QUOTE_CATEGORIES = { 'Wycena CN': 'cn', 'Wycena dla klienta': 'pl' }

const LIMIT = 300 // maksymalna liczba ostatnich wiadomości wczytywanych na start (wydajność przy dużej historii)

const MSG_SELECT = '*, profiles(full_name), documents!attachment_document_id(id, file_name, category, file_path)'

export default function TabCzat({ clientId, clientName, projects, profiles: profilesProp, onChanged }) {
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
  const [pendingFile, setPendingFile] = useState(null) // plik czekający na wybór kategorii w popupie
  const [dragOver, setDragOver] = useState(false)
  const [imgUrls, setImgUrls] = useState({})
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
  const [ownProfiles, setOwnProfiles] = useState([])
  const [unreadMap, setUnreadMap] = useState({})
  // Wycena wgrywana na czacie klienta — ten czat nie jest przypisany do
  // jednego zamówienia (w przeciwieństwie do czatu zamówienia), więc trzeba
  // dodatkowo wybrać, którego zamówienia dotyczy plik.
  const [pendingQuoteFile, setPendingQuoteFile] = useState(null) // { file, side, project, detectedValue, itemCount, text }
  const [quoteProjectId, setQuoteProjectId] = useState(null)
  const [forwardPayload, setForwardPayload] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const profiles = profilesProp && profilesProp.length ? profilesProp : ownProfiles

  useEffect(() => {
    if (projects && projects.length && !quoteProjectId) setQuoteProjectId(projects[0].id)
  }, [projects])

  useEffect(() => {
    if (profilesProp && profilesProp.length) return
    supabase.from('profiles').select('id,full_name').then(({ data }) => setOwnProfiles(data || []))
  }, [profilesProp])

  // Liczniki nieprzeczytanych na czatach zamówień tego klienta (żeby dało się
  // rozróżnić, które kafelki mają nowe wiadomości bez wchodzenia w każdy z
  // osobna) — odświeżane na starcie i przy każdej nowej wiadomości na
  // dowolnym kanale w aplikacji.
  const loadUnread = async () => {
    const { data, error } = await supabase.from('v_chat_unread_counts').select('*')
    if (error) { console.error(error); return }
    setUnreadMap(Object.fromEntries((data || []).map(r => [r.channel_id, r.unread_count])))
  }

  useEffect(() => {
    loadUnread()
    const sub = supabase
      .channel(`client-chat-unread-${clientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => loadUnread())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [clientId])

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
      // Otwarcie zakładki Czat w panelu klienta liczy się jako przeczytanie
      // czatu klienta (nie czatów zamówień pod nim — te otwiera się osobno).
      await supabase.from('chat_channel_reads').upsert({ channel_id: ch.id, user_id: user.id, last_read_at: new Date().toISOString() })
      loadUnread()

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

  // Wysyła gotową wiadomość czatu klienta (treść + ewentualny załącznik-dokument
  // już zapisany) — wspólne dla zwykłego wysyłania i dla zakończenia przepływu
  // podglądu Excela poniżej.
  const sendChatMessage = async (content, attachmentDocId, srcText) => {
    const { data: { user } } = await supabase.auth.getUser()
    const mentionIds = extractMentions(srcText, profiles)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: channelId, sender_id: user.id, content,
      attachment_document_id: attachmentDocId,
      mentioned_user_ids: mentionIds.length ? mentionIds : null,
    }).select(MSG_SELECT).single()
    if (error) { toast.error('Nie udało się wysłać wiadomości: ' + error.message); return }
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    if (inserted) { triggerTranslation(inserted); triggerPushNotification(inserted) }
  }

  const handleSend = async () => {
    if ((!text.trim() && !attachFile) || !channelId) return
    if (attachFile && isFileTooBig(attachFile)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }

    // Kategoria "Wycena CN"/"Wycena dla klienta" na czacie KLIENTA (nie
    // zamówienia) to jedna z kilku niezależnych dróg wgrania karty wyceny.
    // Ten czat nie jest przypisany do jednego zamówienia, więc trzeba
    // wiedzieć, którego z nich dotyczy plik — jeśli klient ma więcej niż
    // jedno, wybiera je w selektorze obok kategorii (patrz JSX niżej); jeśli
    // nie ma żadnego, nie ma do czego przypisać wyceny i trzeba najpierw
    // założyć zamówienie.
    if (attachFile && QUOTE_CATEGORIES[attachCategory]) {
      if (!projects || projects.length === 0) {
        toast.error(t('Ten klient nie ma jeszcze żadnego zamówienia — najpierw utwórz zamówienie, do którego ma zostać przypisana ta wycena.'))
        return
      }
      const targetProjectId = projects.length === 1 ? projects[0].id : quoteProjectId
      const targetProject = projects.find(p => p.id === targetProjectId)
      if (!targetProject) { toast.error(t('Wybierz zamówienie, do którego należy ta wycena.')); return }
      setSending(true)
      const { value, itemCount } = await detectQuoteValue(attachFile)
      setSending(false)
      setPendingQuoteFile({ file: attachFile, side: QUOTE_CATEGORIES[attachCategory], project: targetProject, detectedValue: value, itemCount, text: text.trim() })
      return
    }

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
    await sendChatMessage(text.trim() || `📎 ${attachFile?.name || ''}`, attachmentDocId, text)
    setSending(false)
    setText(''); setAttachFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleCancelQuoteValue = () => setPendingQuoteFile(null)

  const handleConfirmQuoteValue = async (value) => {
    const { file, side, project, text: srcText } = pendingQuoteFile
    setSending(true)
    const result = await saveQuoteFile({ file, project, client: { id: clientId, name: clientName }, side, value, source: 'chat' })
    if (!result.ok) { setSending(false); toast.error(t('Nie udało się zapisać wyceny: ') + result.error); setPendingQuoteFile(null); return }
    const actionLabel = result.overwritten ? t('Wycena nadpisana') : t('Wycena zapisana')
    const sideLabel = side === 'cn' ? t('od zespołu CN') : t('dla klienta (z marżą)')
    const notifyNote = side === 'cn' ? ` — ${t('powiadomiono')} ${result.notified} ${t('os. z zespołu')}` : ''
    const infoNote = `📊 ${actionLabel} ${sideLabel} (${project?.order_label}): ${file?.name}${notifyNote}`
    const content = srcText ? `${srcText}\n\n${infoNote}` : infoNote
    await sendChatMessage(content, null, srcText)
    setSending(false)
    setPendingQuoteFile(null)
    setText(''); setAttachFile(null)
    if (fileRef.current) fileRef.current.value = ''
    // Wycena powstała/nadpisała się w bazie — rodzic (panel klienta) trzyma
    // własne kopie dokumentów/wycen do StageTimeline/Dokumentów i bez tego
    // odświeżenia nie zobaczy zmiany aż do ręcznego przeładowania strony.
    if (onChanged) onChanged()
  }

  const handleDownload = async (doc) => {
    if (!doc) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 3600)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    setPreviewFile({ url: data.signedUrl, fileName: doc.file_name })
  }

  // Przeciągnij-i-upuść plik (np. z Findera/Eksploratora albo z WeChat, jeśli
  // dana aplikacja na to pozwala) wprost na okno czatu — od razu pyta o
  // kategorię w popupie, z szybką opcją "Brak kategoryzacji".
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) setPendingFile(file)
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
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{t("Czat zamówienia →")}</div>
                </div>
                <UnreadBadge count={unreadMap[c.id]} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{
          background: dragOver ? C.blight : C.white, border: `1.5px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? C.blue : C.border}`,
          borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 480, transition: 'all .12s ease', position: 'relative',
        }}>
        {dragOver && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(37,99,235,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.blue, pointerEvents: 'none', zIndex: 2 }}>
            {t("↓ Upuść plik tutaj")}
          </div>
        )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{name}</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{new Date(m.created_at).toLocaleString('pl-PL')}</span>
                    <ForwardIconButton size={18}
                      onClick={() => setForwardPayload({ text: m.content, documentId: doc?.id || null, fileName: doc?.file_name || null })}
                      title={t('Prześlij dalej')} />
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 1 }}><MentionText text={m.content} profiles={profiles} /></div>
                  {m.translated_content && m.translated_content !== m.content && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🌐 {m.translated_content}</div>}
                  {doc && isImageFile(doc.file_name) && imgUrls[doc.id] && (
                    <img src={imgUrls[doc.id]} alt={doc.file_name} onClick={() => handleDownload(doc)}
                      style={{ display: 'block', marginTop: 5, maxWidth: 240, maxHeight: 240, borderRadius: 8, cursor: 'pointer', objectFit: 'cover' }} />
                  )}
                  {doc && isImageFile(doc.file_name) && !imgUrls[doc.id] && (
                    <div style={{ marginTop: 5, width: 160, height: 110, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>{t("Ładowanie zdjęcia…")}</div>
                  )}
                  {doc && !isImageFile(doc.file_name) && (
                    <AttachmentCard fileName={doc.file_name} subtitle={t(doc.category)} onClick={() => handleDownload(doc)} />
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
            {QUOTE_CATEGORIES[attachCategory] && projects && projects.length > 1 && (
              <select value={quoteProjectId || ''} onChange={e => setQuoteProjectId(e.target.value)}
                title={t("Do którego zamówienia należy ta wycena?")}
                style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10.5, maxWidth: 150 }}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
              </select>
            )}
            <span onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.muted }}>{t("✕ usuń")}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f) }} />
          <button onClick={() => fileRef.current?.click()} title={t("Załącz dokument")} style={{ padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer' }}>📎</button>
          <MentionInput value={text} onChange={setText} onEnter={handleSend} profiles={profiles}
            placeholder={t("Napisz wiadomość do klienta… (@ żeby wspomnieć kogoś)")}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', fontSize: 12.5 }} />
          <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)}
            style={{ border: 'none', background: C.blue, color: '#fff', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (sending || (!text.trim() && !attachFile)) ? .5 : 1 }}>
            {t("Wyślij")}
          </button>
        </div>
      </div>
      {pendingFile && (
        <AttachCategoryModal file={pendingFile} categories={DOC_CATEGORIES}
          onCancel={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = '' }}
          onConfirm={(cat) => { setAttachFile(pendingFile); setAttachCategory(cat); setPendingFile(null) }} />
      )}
      {pendingQuoteFile && (
        <QuoteValueModal
          file={pendingQuoteFile.file}
          side={pendingQuoteFile.side}
          detectedValue={pendingQuoteFile.detectedValue}
          itemCount={pendingQuoteFile.itemCount}
          saving={sending}
          onConfirm={handleConfirmQuoteValue}
          onCancel={handleCancelQuoteValue}
        />
      )}
      {forwardPayload && <ForwardModal payload={forwardPayload} onClose={() => setForwardPayload(null)} />}
      {previewFile && <FilePreviewModal url={previewFile.url} fileName={previewFile.fileName} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}
