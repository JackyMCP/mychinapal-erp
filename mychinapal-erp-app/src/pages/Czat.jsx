import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB, isImageFile } from '../lib/files'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import NewChannelModal from '../components/czat/NewChannelModal'
import VoiceChannel from '../components/dashboard/VoiceChannel'
import { DOC_CATEGORIES } from '../components/projekty/stageDefs'
import { useUI } from '../lib/ui'
import EmptyState from '../components/ui/EmptyState'
import useIsMobile from '../lib/useIsMobile'
import { MOBILE_TOPBAR_HEIGHT } from '../components/Sidebar'
import { triggerTranslation, triggerPushNotification } from '../lib/translateMessage'
import UnreadBadge from '../components/czat/UnreadBadge'
import AttachCategoryModal from '../components/ui/AttachCategoryModal'
import MentionInput from '../components/czat/MentionInput'
import MentionText from '../components/czat/MentionText'
import { extractMentions } from '../lib/mentions'
import { detectQuoteValue, saveQuoteFile } from '../lib/quoteIntake'
import QuoteValueModal from '../components/wyceny/QuoteValueModal'
import ForwardModal from '../components/ForwardModal'
import FilePreviewModal from '../components/ui/FilePreviewModal'
import AttachmentCard from '../components/ui/AttachmentCard'
import ForwardIconButton from '../components/ui/ForwardIconButton'
import DeleteMessageButton from '../components/ui/DeleteMessageButton'

const QUOTE_CATEGORIES = { 'Wycena CN': 'cn', 'Wycena dla klienta': 'pl' }

const LIMIT = 300 // maksymalna liczba ostatnich wiadomości wczytywanych na start (wydajność przy dużej historii)
const MSG_SELECT = '*, profiles(full_name, avatar_url), documents!attachment_document_id(id, file_name, category, file_path, created_at)'

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
  const { toast, confirm } = useUI()
  const { profile, isZarzad } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
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
  const [attachPreviewUrl, setAttachPreviewUrl] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [imgUrls, setImgUrls] = useState({})
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [channelDocs, setChannelDocs] = useState([])
  const [clientOrderChannels, setClientOrderChannels] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [clientUnread, setClientUnread] = useState({})
  const [allProfiles, setAllProfiles] = useState([])
  const [showMentions, setShowMentions] = useState(false)
  const [myMentions, setMyMentions] = useState([])
  const [loadingMentions, setLoadingMentions] = useState(false)
  const [quoteProjectId, setQuoteProjectId] = useState(null) // wybór zamówienia na kanale klienta (nieprzypisanym do jednego projektu)
  const [pendingQuoteFile, setPendingQuoteFile] = useState(null) // { file, side, projectId, text }
  const [forwardPayload, setForwardPayload] = useState(null) // { text, documentId, fileName } — patrz ForwardModal
  const [previewFile, setPreviewFile] = useState(null) // { url, fileName } — podgląd pliku w aplikacji zamiast nowej karty
  const activeIdRef = useRef(null)
  const myIdRef = useRef(null)

  // UWAGA: musi być zdefiniowane PRZED efektami, które z niego korzystają
  // (referencja do `active` w tablicy zależności useEffect nie może wystąpić
  // wcześniej w kodzie niż ta deklaracja — inaczej ReferenceError/TDZ crash).
  const active = channels.find(c => c.id === activeId)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  const loadChannels = async () => {
    setLoadingChannels(true)
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*, clients(name), projects(order_label)')
      .order('created_at', { ascending: false })
    if (error) { console.error(error); toast.error('Nie udało się wczytać kanałów: ' + error.message) }
    setChannels(data || [])
    setLoadingChannels(false)
    const wanted = searchParams.get('channel')
    if (wanted && data && data.some(c => c.id === wanted)) {
      openChannel(wanted)
    } else if (!activeId && data && data.length > 0) {
      openChannel(data[0].id)
    }
  }

  // znaczy kanał jako przeczytany przez aktualnego użytkownika — zeruje jego
  // czerwone kółko lokalnie i zapisuje znacznik czasu w bazie
  const markChannelRead = async (channelId) => {
    if (!channelId) return
    setUnreadCounts(prev => (prev[channelId] ? { ...prev, [channelId]: 0 } : prev))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('chat_channel_reads').upsert({
      channel_id: channelId, user_id: user.id, last_read_at: new Date().toISOString(),
    })
    loadClientUnread()
  }

  const openChannel = (channelId) => { setActiveId(channelId); markChannelRead(channelId) }

  const loadUnreadCounts = async () => {
    const { data, error } = await supabase.from('v_chat_unread_counts').select('*')
    if (error) { console.error(error); return }
    const map = Object.fromEntries((data || []).map(r => [r.channel_id, r.unread_count]))
    if (activeIdRef.current) map[activeIdRef.current] = 0
    setUnreadCounts(map)
  }

  // Suma nieprzeczytanych na WSZYSTKICH czatach danego klienta (czat klienta +
  // wszystkie czaty zamówień pod nim) — żeby kafelek klienta na tej liście
  // (i zakładka "Czat" w panelu klienta, patrz Klienci.jsx) pokazywały pełną
  // liczbę, a nie tylko wiadomości wysłane bezpośrednio na czacie klienta.
  const loadClientUnread = async () => {
    const { data, error } = await supabase.from('v_chat_client_unread_counts').select('*')
    if (error) { console.error(error); return }
    setClientUnread(Object.fromEntries((data || []).map(r => [r.client_id, r.unread_count])))
  }

  const loadMyMentions = async () => {
    if (!myIdRef.current) return
    setLoadingMentions(true)
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, content, created_at, channel_id, profiles(full_name), chat_channels(name)')
      .contains('mentioned_user_ids', [myIdRef.current])
      .order('created_at', { ascending: false })
      .limit(30)
    setLoadingMentions(false)
    if (error) { console.error(error); return }
    setMyMentions(data || [])
  }

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    loadChannels()
    loadUnreadCounts()
    loadClientUnread()
    supabase.from('profiles').select('id,full_name').then(({ data }) => setAllProfiles(data || []))
    supabase.auth.getUser().then(({ data }) => { myIdRef.current = data?.user?.id || null })
  }, [])

  // globalny nasłuch nowych wiadomości ze WSZYSTKICH kanałów (nie tylko
  // aktywnego) — żeby czerwone kółka aktualizowały się na żywo, także dla
  // kanałów, których w danej chwili nie mamy otwartych
  useEffect(() => {
    const sub = supabase
      .channel('chat_unread_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = payload.new
        if (!row || row.sender_id === myIdRef.current) return
        if (row.channel_id === activeIdRef.current) { markChannelRead(row.channel_id); return }
        setUnreadCounts(prev => ({ ...prev, [row.channel_id]: (prev[row.channel_id] || 0) + 1 }))
        loadClientUnread()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); setHasMore(false); return }
    let cancelled = false
    setShowFiles(false)
    setShowSearch(false)
    setSearchQuery('')
    setRenaming(false)
    setHasMore(false)

    ;(async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MSG_SELECT)
        .eq('channel_id', activeId)
        .order('created_at', { ascending: false })
        .limit(LIMIT)
      if (error) { console.error(error); toast.error('Nie udało się wczytać historii wiadomości: ' + error.message); return }
      if (!cancelled) {
        setMessages((data || []).slice().reverse())
        setHasMore((data || []).length === LIMIT)
        setScrollTick(tk => tk + 1)
      }
    })()

    const sub = supabase
      .channel(`chat_messages_${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeId}` }, async (payload) => {
        const { data, error } = await supabase.from('chat_messages').select(MSG_SELECT).eq('id', payload.new.id).single()
        if (error) { console.error(error); return }
        const row = data || payload.new
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
        setScrollTick(tk => tk + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeId}` }, (payload) => {
        // np. dotarło tłumaczenie z funkcji translate-chat-message
        setMessages(prev => prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(sub) }
  }, [activeId])

  // Panel "📎 Pliki" pokazywał WYŁĄCZNIE pliki wysłane jako zwykły załącznik
  // wiadomości (attachment_document_id) — pliki wyceny (kategorie "Wycena
  // CN"/"Wycena dla klienta") trafiają na kartę wyceny/Dokumenty NIEZALEŻNIE
  // od wiadomości (patrz lib/quoteIntake.js: wiadomość dostaje
  // attachment_document_id=null), więc mimo poprawnego zapisania w bazie w
  // ogóle się tu nie pojawiały — wyglądało to tak, jakby wgranie pliku w
  // ogóle się nie udało. Doczytujemy więc wprost wszystkie dokumenty tego
  // klienta/zamówienia (te same, które widać w "Pliki projektu"/zakładce
  // Wyceny), żeby panel na czacie pokazywał komplet, a nie tylko podzbiór.
  useEffect(() => {
    if (!active || (!active.project_id && !active.client_id)) { setChannelDocs([]); return }
    let cancelled = false
    ;(async () => {
      let query = supabase.from('documents').select('*').eq('visible_in_files', true).order('created_at', { ascending: false })
      query = active.project_id ? query.eq('project_id', active.project_id) : query.eq('client_id', active.client_id)
      const { data, error } = await query
      if (!cancelled && !error) setChannelDocs(data || [])
    })()
    return () => { cancelled = true }
  }, [activeId, active?.project_id, active?.client_id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scrollTick])

  // Podgląd zdjęcia od razu po jego wybraniu, jeszcze przed wysłaniem
  useEffect(() => {
    if (attachFile && isImageFile(attachFile.name)) {
      const url = URL.createObjectURL(attachFile)
      setAttachPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setAttachPreviewUrl(null)
  }, [attachFile])

  // Podpisane URL-e obrazków-załączników, żeby zdjęcia w czacie wyświetlały
  // się od razu jako miniatura (tak jak w typowych komunikatorach), zamiast
  // samego linku do pobrania.
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

  useEffect(() => {
    const type = active ? channelType(active) : null
    if (!active || type !== 'klient' || !active.client_id) { setClientOrderChannels([]); return }
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: projs } = await supabase.from('projects').select('id,order_label').eq('client_id', active.client_id)
      if (!projs || projs.length === 0) { if (!cancelled) setClientOrderChannels([]); return }
      const projectIds = projs.map(p => p.id)
      const { data: existing } = await supabase.from('chat_channels').select('id,name,project_id,client_id,created_by').in('project_id', projectIds)
      const existingByProject = new Map((existing || []).map(c => [c.project_id, c]))
      const result = []
      for (const p of projs) {
        let pc = existingByProject.get(p.id)
        if (!pc) {
          const { data: created, error } = await supabase.from('chat_channels').insert({
            name: p.order_label, client_id: active.client_id, project_id: p.id, created_by: user.id,
          }).select('id,name,project_id,client_id,created_by').single()
          if (error) { console.error(error); continue }
          pc = created
        }
        result.push(pc)
      }
      if (!cancelled) {
        setClientOrderChannels(result)
        // dopisz nowe/nieznane kanały do głównej listy, żeby "active" dało się
        // znaleźć po kliknięciu kafelka, nawet jeśli kanał dopiero co powstał
        setChannels(prev => {
          const byId = new Map(prev.map(c => [c.id, c]))
          let changed = false
          for (const c of result) { if (!byId.has(c.id)) { byId.set(c.id, c); changed = true } }
          return changed ? Array.from(byId.values()) : prev
        })
      }
    })()
    return () => { cancelled = true }
  }, [active?.id])

  useEffect(() => {
    setQuoteProjectId(clientOrderChannels.length ? clientOrderChannels[0].project_id : null)
  }, [clientOrderChannels])

  const loadOlder = async () => {
    if (!activeId || loadingMore || !messages.length) return
    setLoadingMore(true)
    const oldest = messages[0].created_at
    const { data, error } = await supabase.from('chat_messages').select(MSG_SELECT)
      .eq('channel_id', activeId).lt('created_at', oldest)
      .order('created_at', { ascending: false }).limit(LIMIT)
    setLoadingMore(false)
    if (error) { toast.error(t('Nie udało się wczytać starszych wiadomości: ') + error.message); return }
    const older = (data || []).slice().reverse()
    setHasMore(older.length === LIMIT)
    setMessages(prev => [...older, ...prev])
  }

  // Kategoria "Wycena CN"/"Wycena dla klienta" na kanale klienta/projektu w
  // module Czat — jedna z kilku niezależnych dróg wgrania karty wyceny (obok
  // czatu zamówienia, czatu klienta w panelu Klienci, panelu Plików projektu
  // i zakładki Wyceny). Kanał "projekt" ma project_id wprost; kanał "klient"
  // wymaga wyboru KTÓREGO zamówienia dotyczy plik (patrz selektor w JSX).
  const handleSend = async () => {
    if ((!text.trim() && !attachFile) || !activeId) return
    if (attachFile && isFileTooBig(attachFile)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }

    if (attachFile && QUOTE_CATEGORIES[attachCategory]) {
      if (!active?.client_id) { toast.error(t('Załączniki dostępne tylko na kanałach klienta/projektu.')); return }
      const targetProjectId = active.project_id || quoteProjectId
      if (!targetProjectId) { toast.error(t('Wybierz zamówienie, do którego należy ta wycena.')); return }
      setSending(true)
      const { value, itemCount } = await detectQuoteValue(attachFile)
      setSending(false)
      setPendingQuoteFile({ file: attachFile, side: QUOTE_CATEGORIES[attachCategory], projectId: targetProjectId, detectedValue: value, itemCount, text: text.trim() })
      return
    }

    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()

    let attachmentDocId = null
    if (attachFile) {
      if (!active?.client_id) {
        setSending(false)
        toast.error('Ten kanał nie jest powiązany z klientem — załączniki można wysyłać tylko na kanałach klienta/projektu.')
        return
      }
      const path = `${active.client_id}/${crypto.randomUUID()}-${safeFileName(attachFile.name)}`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, attachFile)
      if (upErr) { setSending(false); toast.error('Nie udało się wysłać pliku: ' + upErr.message); return }
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        client_id: active.client_id, project_id: active.project_id || null,
        category: attachCategory, file_path: path, file_name: attachFile.name,
        uploaded_by: user.id, source: 'chat',
      }).select().single()
      if (docErr) { setSending(false); toast.error('Nie udało się zapisać dokumentu: ' + docErr.message); return }
      attachmentDocId = doc.id
    }

    const mentionIds = extractMentions(text, allProfiles)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: activeId, sender_id: user.id, content: text.trim() || `📎 ${attachFile?.name || ''}`,
      attachment_document_id: attachmentDocId,
      mentioned_user_ids: mentionIds.length ? mentionIds : null,
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { console.error(error); toast.error('Nie udało się wysłać wiadomości: ' + error.message); return }
    // pokaż wiadomość natychmiast, niezależnie od tego czy zdarzenie realtime dotrze
    if (inserted) setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]))
    if (inserted) { triggerTranslation(inserted); triggerPushNotification(inserted) }
    setText('')
    setAttachFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCancelQuoteValue = () => setPendingQuoteFile(null)

  const handleConfirmQuoteValue = async (value) => {
    const { file, side, projectId, text: srcText } = pendingQuoteFile
    setSending(true)
    const result = await saveQuoteFile({ file, project: { id: projectId, client_id: active.client_id }, client: { id: active.client_id }, side, value, source: 'chat' })
    if (!result.ok) { setSending(false); toast.error(t('Nie udało się zapisać wyceny: ') + result.error); setPendingQuoteFile(null); return }
    const actionLabel = result.overwritten ? t('Wycena nadpisana') : t('Wycena zapisana')
    const sideLabel = side === 'cn' ? t('od zespołu CN') : t('dla klienta (z marżą)')
    const notifyNote = side === 'cn' ? ` — ${t('powiadomiono')} ${result.notified} ${t('os. z zespołu')}` : ''
    const infoNote = `📊 ${actionLabel} ${sideLabel}${notifyNote}`
    const content = srcText ? `${srcText}\n\n${infoNote}` : infoNote
    const { data: { user } } = await supabase.auth.getUser()
    const mentionIds = extractMentions(srcText, allProfiles)
    // attachment_document_id wskazuje na dokument utworzony przez
    // saveQuoteFile — dzięki temu wiadomość pokazuje normalną kartę
    // załącznika (nazwa/rozmiar/podgląd, jak WhatsApp), a nie tylko sam tekst.
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      channel_id: activeId, sender_id: user.id, content, attachment_document_id: result.documentId,
      mentioned_user_ids: mentionIds.length ? mentionIds : null,
    }).select(MSG_SELECT).single()
    setSending(false)
    if (error) { toast.error('Nie udało się wysłać wiadomości: ' + error.message) }
    else if (inserted) { setMessages(prev => (prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted])); triggerTranslation(inserted); triggerPushNotification(inserted) }
    setPendingQuoteFile(null)
    setText(''); setAttachFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    if (!doc) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(doc.file_path, 300)
    if (error) { toast.error('Nie udało się pobrać pliku: ' + error.message); return }
    setPreviewFile({ url: data.signedUrl, fileName: doc.file_name })
  }

  // Usunięcie (miękkie) własnej wiadomości — tylko autor, bez limitu czasowego.
  const handleDeleteMessage = async (m) => {
    const ok = await confirm(t('Usunąć tę wiadomość? Tej operacji nie można cofnąć.'), { confirmLabel: t('Usuń') })
    if (!ok) return
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x))
    const { error } = await supabase.rpc('soft_delete_chat_message', { p_message_id: m.id })
    if (error) toast.error(t('Nie udało się usunąć wiadomości: ') + error.message)
  }

  // Przeciągnij-i-upuść plik wprost na okno czatu — od razu pyta o kategorię
  // w popupie, z szybką opcją "Brak kategoryzacji". Załączniki działają tylko
  // na kanałach klienckich (tak samo jak przycisk 📎).
  const handleDragOver = (e) => { e.preventDefault(); if (active?.client_id) setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (!active?.client_id) { toast.error(t('Załączniki dostępne tylko na kanałach klienta/projektu.')); return }
    const file = e.dataTransfer?.files?.[0]
    if (file) setPendingFile(file)
  }

  const handleRenameStart = () => { setRenameValue(active.name); setRenaming(true) }
  const handleRenameSave = async () => {
    if (!renameValue.trim() || renameValue.trim() === active.name) { setRenaming(false); return }
    setRenameSaving(true)
    const { data, error } = await supabase.from('chat_channels').update({ name: renameValue.trim() }).eq('id', active.id).select()
    setRenameSaving(false)
    if (error) { toast.error('Nie udało się zmienić nazwy: ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Brak uprawnień do zmiany nazwy tego kanału — może to zrobić tylko Zarząd albo osoba, która utworzyła kanał.'); return }
    setRenaming(false)
    loadChannels()
  }

  // Czaty zamówień są dostępne wyłącznie przez odnośnik z czatu klienta albo z
  // panelu zamówienia (deep-link ?channel=...) — nie mają się przewijać na
  // ogólnej liście kanałów, żeby nie zaśmiecać jej dziesiątkami zamówień.
  const visibleChannels = channels.filter(ch => channelType(ch) !== 'projekt')
  const activeType = active ? channelType(active) : 'ogolny'
  const activeStyle = TYPE_STYLE[activeType]
  const canRename = active && (isZarzad || active.created_by === profile?.id)
  const messageFiles = messages
    .map(m => Array.isArray(m.documents) ? m.documents[0] : m.documents)
    .filter(Boolean)
  // Scalenie plików załączonych wprost do wiadomości (messageFiles) z
  // dokumentami wyceny doczytanymi osobno (channelDocs — patrz efekt wyżej),
  // bez duplikatów, posortowane od najnowszych.
  const channelFiles = [...messageFiles, ...channelDocs]
    .filter((doc, idx, arr) => arr.findIndex(d => d.id === doc.id) === idx)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const fmtTime = ts => new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const searchQueryTrimmed = searchQuery.trim().toLowerCase()
  const visibleMessages = searchQueryTrimmed
    ? messages.filter(m => !m.deleted_at && (m.content || '').toLowerCase().includes(searchQueryTrimmed))
    : messages

  // na telefonie pokazujemy albo listę kanałów, albo okno czatu — nigdy oba naraz
  const mobileShowList = isMobile && !active
  const mobileShowChat = isMobile && active

  return (
    <div style={{ display: 'flex', height: isMobile ? `calc(100vh - ${MOBILE_TOPBAR_HEIGHT}px - env(safe-area-inset-top))` : '100vh' }}>
      <style>{`
        @keyframes czMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes czTileIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes czBarShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .cz-msg { animation: czMsgIn .22s ease both; }
        .cz-tile { animation: czTileIn .18s ease both; }
        .cz-tile:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.07); }
      `}</style>
      {/* Lista kanałów */}
      {(!isMobile || mobileShowList) && (
      <div style={{ width: isMobile ? '100%' : 252, borderRight: `1px solid ${C.border}`, background: C.white, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${C.navy}, ${C.blue}, ${C.purple}, ${C.navy})`, backgroundSize: '300% 100%', animation: 'czBarShift 6s ease infinite' }} />
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700 }}>{t("Kanały")}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setShowMentions(v => !v); if (!showMentions) loadMyMentions() }}
              title={t('Wiadomości, w których Cię wspomniano')}
              style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: showMentions ? C.blight : 'transparent', color: C.blue }}>
              🔔 {t("Wzmianki")}
            </button>
            <button onClick={() => setShowNew(true)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff' }}>+ {t("Nowy")}</button>
          </div>
        </div>
        {showMentions && (
          <div style={{ borderBottom: `1px solid ${C.border}`, maxHeight: 260, overflowY: 'auto', padding: '8px 10px', background: C.bg }}>
            {loadingMentions && <div style={{ fontSize: 11, color: C.muted, padding: 8 }}>{t("Ładowanie…")}</div>}
            {!loadingMentions && myMentions.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 8 }}>{t("Nikt jeszcze Cię tu nie wspomniał.")}</div>}
            {myMentions.map(m => (
              <div key={m.id} onClick={() => { setShowMentions(false); openChannel(m.channel_id) }}
                style={{ padding: '8px 9px', borderRadius: 9, cursor: 'pointer', background: '#fff', border: `1px solid ${C.border}`, marginBottom: 6 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.blue }}>#{m.chat_channels?.name || '?'} · <span style={{ color: C.muted, fontWeight: 600 }}>{m.profiles?.full_name}</span></div>
                <div style={{ fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.content}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{fmtTime(m.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loadingChannels && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>}
          {!loadingChannels && visibleChannels.length === 0 && <EmptyState icon="💬" title={t("Brak kanałów")} subtitle={t("Utwórz pierwszy kanał, żeby zacząć rozmowę.")} />}
          {visibleChannels.map((ch, i) => {
            const type = channelType(ch)
            const st = TYPE_STYLE[type]
            const isActive = activeId === ch.id
            return (
              <div key={ch.id} className="cz-tile" onClick={() => openChannel(ch.id)}
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
                  <UnreadBadge count={type === 'klient' && ch.client_id ? (clientUnread[ch.client_id] || 0) : unreadCounts[ch.id]} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
      {/* Okno czatu */}
      {(!isMobile || mobileShowChat) && (
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', background: dragOver ? C.blight : C.bg, minWidth: 0, position: 'relative', transition: 'background .12s ease' }}>
          {dragOver && (
            <div style={{ position: 'absolute', inset: 8, borderRadius: 12, border: `2px dashed ${C.blue}`, background: 'rgba(37,99,235,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: C.blue, pointerEvents: 'none', zIndex: 5 }}>
              {t("↓ Upuść plik tutaj")}
            </div>
          )}
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
                    {isMobile && (
                      <span onClick={() => setActiveId(null)} style={{ cursor: 'pointer', fontSize: 18, color: C.muted, flexShrink: 0, padding: '2px 4px' }}>←</span>
                    )}
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
                    <button onClick={() => setShowSearch(s => !s)} style={smallBtn({ color: C.blue, bg: C.blight }, showSearch)}>
                      {t('🔍 Szukaj')}
                    </button>
                  </div>
                </div>
                <VoiceChannel roomId={`voice-${active.id}`} currentUserId={profile?.id} currentUserName={profile?.full_name || 'Użytkownik'} accentColor={activeStyle.color} chatChannelId={active.id} />
              </div>
              {showSearch && (
                <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: C.white, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('Szukaj w tym kanale…')}
                    onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
                    style={{ flex: 1, fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', outline: 'none' }} />
                  {searchQuery && (
                    <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>
                      {visibleMessages.length} {t('wynik(ów)')}
                    </span>
                  )}
                  <span onClick={() => { setShowSearch(false); setSearchQuery('') }} style={{ cursor: 'pointer', fontSize: 13, color: C.muted }}>✕</span>
                </div>
              )}
              {activeType === 'klient' && clientOrderChannels.length > 0 && (
                <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: C.white, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {clientOrderChannels.map(c => (
                    <div key={c.id} onClick={() => openChannel(c.id)} className="ux-hover-lift"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 9, background: C.olight, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
                      <span style={{ fontSize: 13 }}>📦</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.orange }}>{c.name}</span>
                      <UnreadBadge count={unreadCounts[c.id]} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hasMore && (
                  <div style={{ textAlign: 'center', marginBottom: 4 }}>
                    <button onClick={loadOlder} disabled={loadingMore}
                      style={{ border: `1px solid ${C.border}`, background: C.white, color: C.blue, borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? .6 : 1 }}>
                      {loadingMore ? t('Wczytywanie…') : t('Wczytaj starsze wiadomości')}
                    </button>
                  </div>
                )}
                {messages.length === 0 && <EmptyState icon="✉️" title={t("Brak wiadomości")} subtitle={t("Napisz pierwszą wiadomość na tym kanale.")} />}
                {messages.length > 0 && searchQueryTrimmed && visibleMessages.length === 0 && (
                  <EmptyState icon="🔍" title={t("Brak wyników")} subtitle={t("Żadna wiadomość w tym kanale nie pasuje do wyszukiwania.")} />
                )}
                {(searchQueryTrimmed ? visibleMessages : messages).map(m => {
                  const mine = m.sender_id === profile?.id
                  const doc = Array.isArray(m.documents) ? m.documents[0] : m.documents
                  return (
                    <div key={m.id} className="cz-msg" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                      {!mine && <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{m.profiles?.full_name || t("Nieznany")}</div>}
                      <div style={{ background: mine ? activeStyle.color : C.white, color: mine ? '#fff' : C.text, border: mine ? 'none' : `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.deleted_at ? (
                          <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{t("Wiadomość usunięta")}</span>
                        ) : (
                          <>
                            <MentionText text={m.content} profiles={allProfiles} mine={mine} />
                            {m.translated_content && (
                              <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${mine ? 'rgba(255,255,255,.25)' : C.border}`, fontSize: 11.5, fontStyle: 'italic', opacity: 0.85 }}>
                                🌐 {m.translated_content}
                              </div>
                            )}
                            {doc && isImageFile(doc.file_name) && imgUrls[doc.id] && (
                              <img src={imgUrls[doc.id]} alt={doc.file_name} onClick={() => handleDownload(doc)}
                                style={{ display: 'block', marginTop: 6, maxWidth: 260, maxHeight: 260, borderRadius: 8, cursor: 'pointer', objectFit: 'cover' }} />
                            )}
                            {doc && isImageFile(doc.file_name) && !imgUrls[doc.id] && (
                              <div style={{ marginTop: 6, width: 180, height: 120, borderRadius: 8, background: mine ? 'rgba(255,255,255,.15)' : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: mine ? 'rgba(255,255,255,.7)' : C.muted }}>
                                {t("Ładowanie zdjęcia…")}
                              </div>
                            )}
                            {doc && !isImageFile(doc.file_name) && (
                              <AttachmentCard fileName={doc.file_name} subtitle={t(doc.category)} onClick={() => handleDownload(doc)} mine={mine} />
                            )}
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <span>{fmtTime(m.created_at)}</span>
                        {mine && !m.deleted_at && (
                          <DeleteMessageButton size={18} title={t('Usuń wiadomość')} onClick={() => handleDeleteMessage(m)} />
                        )}
                        {!m.deleted_at && (
                          <ForwardIconButton size={20}
                            onClick={() => setForwardPayload({ text: m.content, documentId: doc?.id || null, fileName: doc?.file_name || null })}
                            title={t('Prześlij dalej')} />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.white }}>
                {attachFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: C.bg, borderRadius: 8, padding: '6px 10px' }}>
                    {attachPreviewUrl
                      ? <img src={attachPreviewUrl} alt={attachFile.name} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ fontSize: 11.5 }}>📎 {attachFile.name}</span>}
                    <select value={attachCategory} onChange={e => setAttachCategory(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none' }}>
                      {DOC_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                    </select>
                    {QUOTE_CATEGORIES[attachCategory] && activeType === 'klient' && clientOrderChannels.length > 0 && (
                      <select value={quoteProjectId || ''} onChange={e => setQuoteProjectId(e.target.value)}
                        title={t("Do którego zamówienia należy ta wycena?")}
                        style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 11, maxWidth: 140 }}>
                        {clientOrderChannels.map(c => <option key={c.project_id} value={c.project_id}>{c.name}</option>)}
                      </select>
                    )}
                    <span onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 11, color: C.muted }}>{t("✕ usuń")}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f) }} />
                  <button onClick={() => fileInputRef.current?.click()} title={active?.client_id ? 'Załącz plik' : 'Załączniki dostępne tylko na kanałach klienta/projektu'} disabled={!active?.client_id}
                    style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, cursor: active?.client_id ? 'pointer' : 'not-allowed', background: 'transparent', color: active?.client_id ? C.text2 : C.muted, opacity: active?.client_id ? 1 : 0.5 }}>
                    📎
                  </button>
                  <MentionInput value={text} onChange={setText} onEnter={handleSend} profiles={allProfiles}
                    placeholder={t("Napisz wiadomość… (@ żeby wspomnieć kogoś)")} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, outline: 'none' }} />
                  <button onClick={handleSend} disabled={sending || (!text.trim() && !attachFile)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: activeStyle.color, color: '#fff', opacity: (sending || (!text.trim() && !attachFile)) ? 0.5 : 1 }}>
                    {t("Wyślij")}
                  </button>
                </div>
              </div>
            </>
          )}
          {pendingFile && (
            <AttachCategoryModal file={pendingFile} categories={DOC_CATEGORIES}
              onCancel={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
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
        </div>
        {active && showFiles && (
          <div style={isMobile
            ? { position: 'fixed', inset: 0, top: `calc(${MOBILE_TOPBAR_HEIGHT}px + env(safe-area-inset-top))`, zIndex: 70, background: C.white, overflowY: 'auto', padding: 16 }
            : { width: 260, borderLeft: `1px solid ${C.border}`, background: C.white, overflowY: 'auto', padding: '16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>📎 {t("Pliki na tym kanale")}</div>
              {isMobile && <span onClick={() => setShowFiles(false)} style={{ cursor: 'pointer', fontSize: 13, color: C.muted }}>✕</span>}
            </div>
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
      )}
      {showNew && <NewChannelModal onClose={() => setShowNew(false)} onCreated={(ch) => { setShowNew(false); loadChannels(); openChannel(ch.id) }} />}
      {forwardPayload && <ForwardModal payload={forwardPayload} onClose={() => setForwardPayload(null)} />}
      {previewFile && <FilePreviewModal url={previewFile.url} fileName={previewFile.fileName} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
