import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../lib/ui'
import { C } from '../lib/theme'
import PageHeader from '../components/PageHeader'
import useIsMobile from '../lib/useIsMobile'
import FilePreviewModal from '../components/ui/FilePreviewModal'
import AttachFromAppModal from '../components/poczta/AttachFromAppModal'
import AttachmentCard from '../components/ui/AttachmentCard'

// Moduł Poczta — każdy pracownik łączy WŁASNĄ skrzynkę Outlook (Microsoft
// Graph OAuth, patrz outlook-oauth-start/outlook-oauth-callback). Nowe maile
// w KAŻDYM folderze (Odebrane/Wysłane/Wersje robocze/Usunięte/Archiwum/
// własne) trafiają tu na żywo przez webhook Graph -> email_messages, a
// Supabase Realtime pcha je od razu do tego widoku bez odświeżania strony.
// Skrzynka jest prywatna — nikt (nawet zarząd) nie widzi cudzej poczty,
// dokładnie jak w prawdziwym Outlooku. Pełna funkcjonalność 1:1 z Outlookiem:
// wszystkie foldery, kategorie (kolorowe etykiety), Szybkie kroki, podział
// Priorytetowe/Inne (klasyfikacja Graph), załączniki, kontakty, AI
// podsumowania (Claude) — patrz outlook-manage-message / outlook-send-mail /
// outlook-summarize-email / outlook-sync-attachments.

const FOLDER_META = {
  inbox: { label: 'Odebrane', icon: '📥', order: 1 },
  sentitems: { label: 'Elementy wysłane', icon: '📤', order: 2 },
  drafts: { label: 'Wersje robocze', icon: '📝', order: 3 },
  deleteditems: { label: 'Elementy usunięte', icon: '🗑️', order: 4 },
  junkemail: { label: 'Wiadomości-śmieci', icon: '🚫', order: 5 },
  archive: { label: 'Archiwum', icon: '🗄️', order: 6 },
}

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Obrazki osadzone w treści/podpisie maila (logo firmy, ikony social media w
// stopce itp.) mają w Graph API flagę isInline=true + contentId, i treść HTML
// odwołuje się do nich przez `cid:XXX` — przeglądarka nie umie wczytać takiego
// URI bezpośrednio (to schemat tylko dla klientów pocztowych), więc podmieniamy
// każde wystąpienie na prawdziwy (podpisany) URL Supabase Storage, DOKŁADNIE
// tak jak robi to pod maską Outlook, żeby logo/ikonki wyświetliły się w treści
// zamiast trafiać na listę załączników jako osobne pliki do pobrania.
async function resolveInlineImages(html, attachments) {
  const inline = (attachments || []).filter(a => a.is_inline && a.content_id)
  if (!html || !inline.length) return html || ''
  let out = html
  for (const a of inline) {
    const { data: signed } = await supabase.storage.from('dokumenty').createSignedUrl(a.storage_path, 3600)
    if (signed?.signedUrl) {
      const cid = a.content_id.replace(/[<>]/g, '')
      out = out.split(`cid:${cid}`).join(signed.signedUrl)
    }
  }
  return out
}

// Graficzny podpis maila — doklejany automatycznie pod treścią KAŻDEJ nowej
// wiadomości/odpowiedzi/przekazania (o ile signature_enabled !== false),
// konfigurowalny przez każdego pracownika osobno w "⚙️ Ustawienia poczty"
// (imię/nazwisko, stanowisko, telefon — e-mail zawsze z połączonego konta).
// Logo to stały, publiczny plik z /public (bez hashowania nazwy przez Vite,
// więc URL jest trwały między wdrożeniami) — musi być pełnym absolutnym URL,
// żeby wyświetlił się u odbiorcy w Outlooku/Gmailu, a nie tylko lokalnie.
const SIGNATURE_LOGO_URL = 'https://mychinapal-erp.vercel.app/logo-navy.png'

function buildSignatureHtml({ fullName, title, phone, email, includeLogo }) {
  if (!fullName && !title && !phone && !email) return ''
  const rows = []
  if (email) rows.push(`<div><b>E-mail:</b> ${email}</div>`)
  if (phone) rows.push(`<div><b>Telefon:</b> ${phone}</div>`)
  return `
<table cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td style="vertical-align:top;padding-right:16px;">
      <div style="font-size:14px;font-weight:700;color:#0A1628;">${fullName || ''}</div>
      ${title ? `<div style="font-size:12px;color:#64748B;">${title}</div>` : ''}
    </td>
    <td style="border-left:2px solid #2563EB;padding-left:16px;vertical-align:top;">
      <div style="font-size:12px;color:#0A1628;line-height:1.5;">${rows.join('')}</div>
      <div style="font-size:12px;color:#64748B;">mychinapal.pl</div>
    </td>
  </tr>
  ${includeLogo ? `<tr><td colspan="2" style="padding-top:12px;"><img src="${SIGNATURE_LOGO_URL}" alt="MyChinaPal" style="height:56px;" /></td></tr>` : ''}
</table>`
}

// Pole "Do"/"DW" z podpowiedziami adresów — filtruje po pierwszych znakach
// nazwy LUB adresu (fragment tekstu po ostatnim przecinku), źródło
// podpowiedzi: zapisane Kontakty + adresy z historii korespondencji.
function AddressField({ value, onChange, placeholder, people }) {
  const [open, setOpen] = useState(false)
  const parts = value.split(',')
  const fragment = parts[parts.length - 1].trim().toLowerCase()
  const suggestions = fragment.length >= 1
    ? people.filter(p => p.email.toLowerCase().startsWith(fragment) || (p.name || '').toLowerCase().startsWith(fragment)).slice(0, 6)
    : []
  const pick = (p) => {
    const head = parts.slice(0, -1).map(s => s.trim()).filter(Boolean)
    onChange([...head, p.email].join(', ') + ', ')
    setOpen(false)
  }
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 10px 24px rgba(0,0,0,.18)', marginTop: -6, marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
          {suggestions.map(p => (
            <div key={p.email} onMouseDown={(e) => { e.preventDefault(); pick(p) }} style={{ padding: '7px 10px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, fontSize: 11.5 }}>{p.name}</div>
              <div style={{ color: C.muted, fontSize: 10.5 }}>{p.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tekst zawiera znaki chińskie? Używane do auto-wykrycia języka oryginału
// maila (dokładnie ten sam wzorzec co w tłumaczeniu czatu — patrz
// translate-chat-message) — dzięki temu wiemy, czy dany mail trzeba
// przetłumaczyć, żeby pasował do aktualnie wybranego języka interfejsu.
const CJK_RE = /[一-鿿]/
function isChineseText(str) { return CJK_RE.test(str || '') }

export default function Poczta() {
  const { t, lang } = useLang()
  const { session } = useAuth()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [account, setAccount] = useState(null)
  const [messages, setMessages] = useState([])
  const [folders, setFolders] = useState([])
  const [categories, setCategories] = useState([])
  const [quickSteps, setQuickSteps] = useState([])
  const [contacts, setContacts] = useState([])
  const [view, setView] = useState('mail') // 'mail' | 'contacts'
  const [folder, setFolder] = useState('inbox')
  const [focusTab, setFocusTab] = useState('focused') // 'focused' | 'other' (tylko Odebrane)
  const [search, setSearch] = useState('')
  const [selectedThreadId, setSelectedThreadId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState({ to: '', cc: '', subject: '', body: '', attachments: [] })
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardTo, setForwardTo] = useState('')
  const [forwardCc, setForwardCc] = useState('')
  const [forwardComment, setForwardComment] = useState('')
  const [forwardTask, setForwardTask] = useState({ create: false, assignedTo: '', clientId: '', projectId: '', dueDate: '', title: '', description: '' })
  const [profiles, setProfiles] = useState([])
  const [taskClients, setTaskClients] = useState([])
  const [taskProjects, setTaskProjects] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sigForm, setSigForm] = useState({ enabled: true, fullName: '', title: '', phone: '', includeLogo: true })
  const [savingSig, setSavingSig] = useState(false)
  const [threadAttachments, setThreadAttachments] = useState({}) // message_id -> [rows]
  const [summarizing, setSummarizing] = useState(false)
  const [quickStepsOpen, setQuickStepsOpen] = useState(false)
  const [newQuickStepOpen, setNewQuickStepOpen] = useState(false)
  const [newQuickStep, setNewQuickStep] = useState({ name: '', markRead: true, destination: 'archive' })
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', color: '#2563EB' })
  const [contactForm, setContactForm] = useState(null) // {id?, name, email, company, phone, notes}
  const [previewFile, setPreviewFile] = useState(null)
  const [resolvedBodyHtml, setResolvedBodyHtml] = useState({}) // message_id -> body_html z podmienionymi cid: na realne URL-e
  const [attachFromAppTarget, setAttachFromAppTarget] = useState(null) // 'compose' | 'reply' | null
  const listRef = useRef(null)
  const composeFileRef = useRef(null)
  const replyFileRef = useRef(null)

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
      const [{ data: msgs, error }, { data: fld }, { data: cats }, { data: qs }] = await Promise.all([
        supabase.from('email_messages').select('*').eq('email_account_id', acc.id).order('received_at', { ascending: false }).limit(800),
        supabase.from('email_folders').select('*').eq('email_account_id', acc.id),
        supabase.from('email_categories').select('*').eq('email_account_id', acc.id).order('created_at'),
        supabase.from('email_quick_steps').select('*').eq('email_account_id', acc.id).order('sort_order'),
      ])
      if (error) toast.error(t('Nie udało się wczytać poczty: ') + error.message)
      setMessages(msgs || [])
      setFolders(fld || [])
      setCategories(cats || [])
      setQuickSteps(qs || [])
    }
    if (session?.user?.id) {
      const { data: cts } = await supabase.from('email_contacts').select('*').eq('user_id', session.user.id).order('name')
      setContacts(cts || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [session?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dane potrzebne tylko do opcjonalnego "Utwórz też zadanie" przy
  // przekazywaniu maila dalej (picker osoby/klienta/zamówienia) — wczytywane
  // raz, niezależnie od tego czy ktoś w ogóle skorzysta z tej opcji.
  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: cls }, { data: prjs }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('projects').select('id, client_id, order_label').order('created_at', { ascending: false }),
      ])
      setProfiles(profs || [])
      setTaskClients(cls || [])
      setTaskProjects(prjs || [])
    })()
  }, [])

  // Otwiera "⚙️ Ustawienia poczty" wypełnione aktualnym stanem podpisu
  // (z email_accounts), z rozsądnym domyślnym imieniem/nazwiskiem z profilu
  // pracownika jeśli podpis jeszcze nie był nigdy skonfigurowany.
  const openSignatureSettings = () => {
    const myName = profiles.find(p => p.id === session?.user?.id)?.full_name || ''
    setSigForm({
      enabled: account?.signature_enabled !== false,
      fullName: account?.signature_full_name ?? myName,
      title: account?.signature_title ?? '',
      phone: account?.signature_phone ?? '',
      includeLogo: account?.signature_include_logo !== false,
    })
    setSettingsOpen(true)
  }

  const handleSaveSignature = async () => {
    setSavingSig(true)
    const patch = {
      signature_enabled: sigForm.enabled,
      signature_full_name: sigForm.fullName || null,
      signature_title: sigForm.title || null,
      signature_phone: sigForm.phone || null,
      signature_include_logo: sigForm.includeLogo,
    }
    const { error } = await supabase.from('email_accounts').update(patch).eq('id', account.id)
    setSavingSig(false)
    if (error) { toast.error(t('Nie udało się zapisać podpisu: ') + error.message); return }
    setAccount(prev => ({ ...prev, ...patch }))
    toast.success(t('Podpis zapisany ✓ — będzie teraz doklejany automatycznie do wiadomości.'))
    setSettingsOpen(false)
  }

  // Dokleja skonfigurowany podpis pod treścią, o ile pracownik go nie
  // wyłączył — wołane tuż przed wysyłką z każdego z 3 miejsc (nowa
  // wiadomość/odpowiedź/przekazanie), żeby zachowanie było identyczne
  // wszędzie i nie trzeba było pamiętać o doklejaniu go ręcznie.
  const withSignature = (html) => {
    if (!account || account.signature_enabled === false) return html
    const sig = buildSignatureHtml({
      fullName: account.signature_full_name,
      title: account.signature_title,
      phone: account.signature_phone,
      email: account.ms_account_email,
      includeLogo: account.signature_include_logo !== false,
    })
    return html + sig
  }

  // Na żywo: nowe/zmienione wiadomości (webhook Graph -> DB, w KAŻDYM
  // folderze) pojawiają się tu bez odświeżania strony.
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
    const { data, error } = await supabase.functions.invoke('outlook-oauth-start')
    setConnecting(false)
    if (error || !data?.ok) {
      console.error('outlook-oauth-start failed:', error, data)
      toast.error(t('Nie udało się rozpocząć łączenia z Outlookiem.'))
      return
    }
    window.location.href = data.url
  }

  // Pełna, uporządkowana lista folderów: znane (w stałej kolejności) + własne.
  const orderedFolders = useMemo(() => {
    const known = Object.keys(FOLDER_META).map(key => {
      const row = folders.find(f => f.well_known_name === key)
      return { key, label: t(FOLDER_META[key].label), icon: FOLDER_META[key].icon, order: FOLDER_META[key].order, graphFolderId: row?.graph_folder_id || null }
    })
    const custom = folders.filter(f => !f.well_known_name).map(f => ({
      key: f.graph_folder_id, label: f.display_name, icon: '📁', order: 100, graphFolderId: f.graph_folder_id,
    }))
    return [...known, ...custom].sort((a, b) => a.order - b.order)
  }, [folders, t])

  const unreadCount = (key) => messages.filter(m => (m.folder || 'inbox') === key && m.direction === 'inbound' && !m.is_read).length

  const folderMessages = useMemo(() => messages.filter(m => (m.folder || 'inbox') === folder), [messages, folder])

  const focusedFolderMessages = useMemo(() => {
    if (folder !== 'inbox') return folderMessages
    return folderMessages.filter(m => focusTab === 'focused' ? m.is_focused !== false : m.is_focused === false)
  }, [folderMessages, folder, focusTab])

  const otherCount = useMemo(() => folder === 'inbox' ? folderMessages.filter(m => m.is_focused === false).length : 0, [folderMessages, folder])

  // Grupowanie w wątki (jak w Outlooku) — jedna pozycja na liście na
  // conversation_id, pokazuje najnowszą wiadomość z wątku.
  const threads = useMemo(() => {
    const byThread = new Map()
    for (const m of focusedFolderMessages) {
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
  }, [focusedFolderMessages, search])

  const selectedThread = threads.find(th => th.key === selectedThreadId) || null
  const selectedMessages = selectedThread
    ? [...selectedThread.all].sort((a, b) => new Date(a.received_at) - new Date(b.received_at))
    : []
  const lastInboundMessage = [...selectedMessages].reverse().find(m => m.direction === 'inbound') || selectedMessages[selectedMessages.length - 1]

  const openThread = async (th) => {
    setSelectedThreadId(th.key)
    setReplyBody('')
    setReplyAttachments([])
    const unread = th.all.filter(m => m.direction === 'inbound' && !m.is_read)
    if (unread.length) {
      await supabase.from('email_messages').update({ is_read: true }).in('id', unread.map(m => m.id))
      setMessages(prev => prev.map(m => unread.some(u => u.id === m.id) ? { ...m, is_read: true } : m))
    }
    // Załączniki: doładuj z DB, a jeśli wiadomość ma has_attachments a nic
    // jeszcze nie zsynchronizowano (backfill bez treści) — dociągnij z Graph.
    const ids = th.all.map(m => m.id)
    const { data: atts } = await supabase.from('email_attachments').select('*').in('message_id', ids)
    const byMsg = {}
    for (const a of (atts || [])) { (byMsg[a.message_id] = byMsg[a.message_id] || []).push(a) }
    setThreadAttachments(byMsg)

    // Podmień cid:XXX w treści na realne URL-e (logo/ikonki podpisu) — tak,
    // żeby wyświetliły się w treści wiadomości zamiast na liście załączników.
    const bodies = {}
    for (const m of th.all) { bodies[m.id] = await resolveInlineImages(m.body_html, byMsg[m.id]) }
    setResolvedBodyHtml(bodies)

    const missing = th.all.filter(m => m.has_attachments && !(byMsg[m.id]?.length))
    for (const m of missing) {
      const { data } = await supabase.functions.invoke('outlook-sync-attachments', { body: { messageId: m.id } })
      if (data?.synced) {
        const { data: fresh } = await supabase.from('email_attachments').select('*').eq('message_id', m.id)
        setThreadAttachments(prev => ({ ...prev, [m.id]: fresh || [] }))
        const html = await resolveInlineImages(m.body_html, fresh)
        setResolvedBodyHtml(prev => ({ ...prev, [m.id]: html }))
      }
    }

    // Auto-tłumaczenie treści (temat+treść) — tylko dla wiadomości, których
    // język oryginału NIE zgadza się z aktualnie wybranym językiem interfejsu
    // (PL/ZH), i tylko jeśli jeszcze nie mamy zapisanego tłumaczenia (kolumny
    // translated_subject/translated_body pełnią rolę trwałego cache'a —
    // patrz translate-email-message). Wynik przychodzi z powrotem przez już
    // istniejący kanał Realtime na email_messages, więc nic więcej nie trzeba
    // tu robić po stronie stanu.
    const wantZh = lang === 'zh'
    const needsTranslation = th.all.filter(m => {
      if (m.translated_subject || m.translated_body) return false
      const isZhOriginal = isChineseText((m.subject || '') + ' ' + (m.body_preview || ''))
      return wantZh !== isZhOriginal
    })
    for (const m of needsTranslation) {
      supabase.functions.invoke('translate-email-message', {
        body: { message_id: m.id, subject: m.subject, body: m.body_html || m.body_preview || '' },
      }).catch(err => console.error('translate-email-message invoke failed', err))
    }
  }

  const downloadAttachment = async (att) => {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(att.storage_path, 120)
    if (error) { toast.error(t('Nie udało się pobrać załącznika: ') + error.message); return }
    setPreviewFile({ url: data.signedUrl, fileName: att.filename })
  }

  const addFilesTo = async (fileList, setAttachmentsFn) => {
    const files = Array.from(fileList || [])
    const encoded = await Promise.all(files.map(async f => ({ filename: f.name, contentType: f.type || 'application/octet-stream', base64: await fileToBase64(f), size: f.size })))
    setAttachmentsFn(prev => [...prev, ...encoded])
  }

  // Druga opcja załączania (obok wgrywania z dysku) — wybór spośród plików
  // już wgranych gdziekolwiek w aplikacji (Dokumenty/Wyceny/czaty), patrz
  // components/poczta/AttachFromAppModal.jsx.
  const handleAttachFromApp = (encoded) => {
    if (attachFromAppTarget === 'reply') setReplyAttachments(prev => [...prev, ...encoded])
    else if (attachFromAppTarget === 'compose') setCompose(c => ({ ...c, attachments: [...c.attachments, ...encoded] }))
  }

  const handleSendCompose = async () => {
    const to = compose.to.split(',').map(s => s.trim()).filter(Boolean)
    const cc = compose.cc.split(',').map(s => s.trim()).filter(Boolean)
    if (!to.length || !compose.subject.trim()) { toast.error(t('Podaj odbiorcę i temat.')); return }
    setSending(true)
    const { data, error } = await supabase.functions.invoke('outlook-send-mail', {
      body: { to, cc, subject: compose.subject, bodyHtml: withSignature(compose.body.replace(/\n/g, '<br/>')), attachments: compose.attachments },
    })
    setSending(false)
    if (error || !data?.ok) { toast.error(t('Nie udało się wysłać wiadomości.')); return }
    toast.success(t('Wiadomość wysłana ✓'))
    setComposeOpen(false)
    setCompose({ to: '', cc: '', subject: '', body: '', attachments: [] })
  }

  const handleReply = async (replyAll) => {
    if (!lastInboundMessage || !replyBody.trim()) return
    setSending(true)
    const { data, error } = await supabase.functions.invoke('outlook-send-mail', {
      body: {
        replyToMessageId: lastInboundMessage.graph_message_id,
        replyAll,
        bodyHtml: withSignature(replyBody.replace(/\n/g, '<br/>')),
        subject: lastInboundMessage.subject,
        to: [lastInboundMessage.from_address].filter(Boolean),
        conversationId: lastInboundMessage.conversation_id,
        attachments: replyAttachments,
      },
    })
    setSending(false)
    if (error || !data?.ok) { toast.error(t('Nie udało się wysłać odpowiedzi.')); return }
    toast.success(t('Odpowiedź wysłana ✓'))
    setReplyBody('')
    setReplyAttachments([])
  }

  const openForward = () => {
    if (!selectedThread) return
    const m = selectedThread.latest
    setForwardTo(''); setForwardCc(''); setForwardComment('')
    setForwardTask({ create: false, assignedTo: '', clientId: '', projectId: '', dueDate: '', title: t('Zapoznaj się: ') + (m.subject || ''), description: '' })
    setForwardOpen(true)
  }

  // Przekazanie dalej (Forward) + opcjonalne utworzenie zadania dla wybranej
  // osoby (niezależnie od tego, na jaki adres poszedł sam mail — np. mail
  // idzie do klienta, a zadanie "ogarnij to" dostaje kolega z zespołu).
  // Załączniki oryginalnej wiadomości Graph przekazuje dalej automatycznie —
  // nie trzeba ich tu ponownie wgrywać (patrz komentarz w edge function).
  const handleForward = async () => {
    const m = selectedThread?.latest
    const to = forwardTo.split(',').map(s => s.trim()).filter(Boolean)
    const cc = forwardCc.split(',').map(s => s.trim()).filter(Boolean)
    if (!m || !to.length) { toast.error(t('Podaj co najmniej jednego odbiorcę.')); return }
    if (forwardTask.create && !forwardTask.assignedTo) { toast.error(t('Wybierz osobę, dla której ma powstać zadanie.')); return }
    setSending(true)
    const { data, error } = await supabase.functions.invoke('outlook-send-mail', {
      body: {
        forwardMessageId: m.graph_message_id,
        to, cc,
        bodyHtml: withSignature(forwardComment.replace(/\n/g, '<br/>')),
        subject: 'Fwd: ' + (m.subject || ''),
        conversationId: m.conversation_id,
        hasAttachments: !!m.has_attachments,
      },
    })
    if (error || !data?.ok) {
      setSending(false)
      toast.error(t('Nie udało się przesłać wiadomości dalej.'))
      return
    }
    let taskFailed = false
    if (forwardTask.create) {
      const { error: taskErr } = await supabase.from('tasks').insert({
        title: forwardTask.title || (t('Zapoznaj się: ') + (m.subject || '')),
        description: forwardTask.description || (t('Przekazany mail: ') + (m.subject || '') + (forwardComment ? ' — ' + forwardComment : '')),
        assigned_to: forwardTask.assignedTo,
        assigned_by: session?.user?.id,
        client_id: forwardTask.clientId || null,
        project_id: forwardTask.projectId || null,
        due_date: forwardTask.dueDate || null,
        status: 'todo',
        priority: 'normalny',
      })
      taskFailed = !!taskErr
    }
    setSending(false)
    toast.success(t('Wiadomość przesłana dalej ✓') + (forwardTask.create ? (taskFailed ? ' — ' + t('ale nie udało się utworzyć zadania') : ' + ' + t('zadanie utworzone')) : ''))
    setForwardOpen(false)
  }

  // --- Akcje na wiadomościach (Graph + lokalny stan od razu) ---
  const runAction = async (messageId, action, targetGraphFolderId) => {
    const { data, error } = await supabase.functions.invoke('outlook-manage-message', { body: { messageId, action, targetGraphFolderId } })
    if (error || !data?.ok) { toast.error(t('Akcja nie powiodła się.')); return false }
    return true
  }

  const applyActionToThread = async (th, action, opts = {}) => {
    const results = await Promise.all(th.all.map(m => runAction(m.id, action, opts.targetGraphFolderId)))
    if (!results.every(Boolean)) return
    setMessages(prev => prev.map(m => {
      if (!th.all.some(x => x.id === m.id)) return m
      if (action === 'mark_read') return { ...m, is_read: true }
      if (action === 'mark_unread') return { ...m, is_read: false }
  if (action === 'archive') return { ...m, folder: 'archive' }
      if (action === 'trash') return { ...m, folder: 'deleteditems' }
      if (action === 'spam') return { ...m, folder: 'junkemail' }
      if (action === 'restore') return { ...m, folder: 'inbox' }
      if (action === 'flag') return { ...m, is_flagged: true }
      if (action === 'unflag') return { ...m, is_flagged: false }
      return m
    }))
    if (['archive', 'trash', 'spam', 'restore'].includes(action) && th.key === selectedThreadId) setSelectedThreadId(null)
    if (!['flag', 'unflag'].includes(action)) toast.success(t('Gotowe ✓'))
  }

  const toggleThreadFlag = async (th) => {
    const flagged = th.latest.is_flagged
    await applyActionToThread(th, flagged ? 'unflag' : 'flag')
  }

  const deleteThreadPermanently = async (th) => {
    const ok = await confirm(t('Usunąć wiadomość na stałe? Tej operacji nie można cofnąć.'), { confirmLabel: t('Usuń na stałe') })
    if (!ok) return
    await Promise.all(th.all.map(m => runAction(m.id, 'delete_permanent')))
    setMessages(prev => prev.filter(m => !th.all.some(x => x.id === m.id)))
    if (th.key === selectedThreadId) setSelectedThreadId(null)
  }

  const runQuickStep = async (qs, th) => {
    if (qs.actions?.markRead) await applyActionToThreadSilent(th, 'mark_read')
    if (qs.actions?.destination === 'archive') await applyActionToThread(th, 'archive')
    else if (qs.actions?.destination === 'trash') await applyActionToThread(th, 'trash')
    else if (qs.actions?.markRead) toast.success(t('Gotowe ✓'))
    setQuickStepsOpen(false)
  }
  const applyActionToThreadSilent = async (th, action) => {
    await Promise.all(th.all.map(m => runAction(m.id, action)))
    setMessages(prev => prev.map(m => th.all.some(x => x.id === m.id) ? { ...m, is_read: action === 'mark_read' } : m))
  }

  const saveQuickStep = async () => {
    if (!newQuickStep.name.trim()) { toast.error(t('Podaj nazwę.')); return }
    const { data, error } = await supabase.from('email_quick_steps').insert({
      email_account_id: account.id, name: newQuickStep.name,
      actions: { markRead: newQuickStep.markRead, destination: newQuickStep.destination || null },
    }).select().single()
    if (error) { toast.error(t('Nie udało się zapisać.')); return }
    setQuickSteps(prev => [...prev, data])
    setNewQuickStepOpen(false)
    setNewQuickStep({ name: '', markRead: true, destination: 'archive' })
  }
  const deleteQuickStep = async (id) => {
    await supabase.from('email_quick_steps').delete().eq('id', id)
    setQuickSteps(prev => prev.filter(q => q.id !== id))
  }

  // --- Kategorie ---
  const saveCategory = async () => {
    if (!newCategory.name.trim()) return
    const { data, error } = await supabase.from('email_categories').insert({ email_account_id: account.id, name: newCategory.name, color: newCategory.color }).select().single()
    if (error) { toast.error(t('Nie udało się dodać kategorii.')); return }
    setCategories(prev => [...prev, data])
    setNewCategory({ name: '', color: '#2563EB' })
  }
  const deleteCategory = async (id) => {
    await supabase.from('email_categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
    setMessages(prev => prev.map(m => ({ ...m, category_ids: (m.category_ids || []).filter(cid => cid !== id) })))
  }
  const toggleMessageCategory = async (msg, catId) => {
    const has = (msg.category_ids || []).includes(catId)
    const next = has ? msg.category_ids.filter(id => id !== catId) : [...(msg.category_ids || []), catId]
    await supabase.from('email_messages').update({ category_ids: next }).eq('id', msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, category_ids: next } : m))
  }

  // --- Kontakty ---
  const saveContact = async () => {
    if (!contactForm?.email?.trim()) { toast.error(t('Podaj adres e-mail.')); return }
    const payload = { user_id: session.user.id, name: contactForm.name || null, email: contactForm.email.trim(), company: contactForm.company || null, phone: contactForm.phone || null, notes: contactForm.notes || null, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('email_contacts').upsert(payload, { onConflict: 'user_id,email' }).select().single()
    if (error) { toast.error(t('Nie udało się zapisać kontaktu.')); return }
    setContacts(prev => {
      const next = prev.filter(c => c.email !== data.email)
      return [...next, data].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
    })
    toast.success(t('Kontakt zapisany ✓'))
    setContactForm(null)
  }
  const deleteContact = async (id) => {
    await supabase.from('email_contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }
  const saveSenderAsContact = (msg) => {
    setContactForm({ name: msg.from_name || '', email: msg.from_address || '', company: '', phone: '', notes: '' })
    setView('contacts')
  }

  // Lista "znanych osób" do podpowiedzi adresów: zapisane Kontakty + adresy
  // wyciągnięte z historii korespondencji (nadawcy i odbiorcy wszystkich
  // wiadomości), scalone i odfiltrowane po adresie e-mail.
  const knownPeople = useMemo(() => {
    const map = new Map()
    for (const c of contacts) if (c.email) map.set(c.email.toLowerCase(), { name: c.name || c.email, email: c.email })
    for (const m of messages) {
      if (m.from_address && !map.has(m.from_address.toLowerCase())) map.set(m.from_address.toLowerCase(), { name: m.from_name || m.from_address, email: m.from_address })
      for (const r of (m.to_addresses || [])) {
        if (r.address && !map.has(r.address.toLowerCase())) map.set(r.address.toLowerCase(), { name: r.name || r.address, email: r.address })
      }
    }
    return Array.from(map.values())
  }, [contacts, messages])

  // --- AI podsumowanie ---
  const handleSummarize = async (msg) => {
    setSummarizing(true)
    const { data, error } = await supabase.functions.invoke('outlook-summarize-email', { body: { messageId: msg.id } })
    setSummarizing(false)
    if (error || !data?.ok) { toast.error(t('Nie udało się podsumować wiadomości.')); return }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ai_summary: data.summary } : m))
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
  const btnStyle = { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }

  // Wyświetla temat/treść w języku dopasowanym do aktualnie wybranego języka
  // interfejsu (PL/ZH) — jeśli oryginał jest w innym języku i mamy już gotowe
  // tłumaczenie (patrz openThread -> translate-email-message), pokazujemy je
  // zamiast oryginału. Dopóki tłumaczenie jeszcze nie wróciło (albo dla
  // wiadomości, które i tak już są w oczekiwanym języku), pokazujemy oryginał.
  const wantsTranslation = (m) => {
    const isZhOriginal = isChineseText((m?.subject || '') + ' ' + (m?.body_preview || ''))
    return (lang === 'zh') !== isZhOriginal
  }
  const displaySubject = (m) => (m && wantsTranslation(m) && m.translated_subject) ? m.translated_subject : (m?.subject || '')
  const displayPreview = (m) => {
    if (!m) return ''
    if (wantsTranslation(m) && m.translated_body) return m.translated_body.slice(0, 100)
    return m.body_preview || stripHtml(m.body_html).slice(0, 100)
  }

  return (
    <div>
      <style>{`.poczta-thread-row-actions { display: none; } .poczta-thread-row:hover .poczta-thread-row-actions { display: flex !important; }`}</style>
      <PageHeader title={t('Poczta')} subtitle={account.ms_account_email} right={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('mail')} style={{ ...btnStyle, background: view === 'mail' ? C.blight : C.white, color: view === 'mail' ? C.blue : C.text2, borderColor: view === 'mail' ? C.blue : C.border }}>📬 {t('Poczta')}</button>
          <button onClick={() => setView('contacts')} style={{ ...btnStyle, background: view === 'contacts' ? C.blight : C.white, color: view === 'contacts' ? C.blue : C.text2, borderColor: view === 'contacts' ? C.blue : C.border }}>👤 {t('Kontakty')} ({contacts.length})</button>
          <button onClick={handleConnect} disabled={connecting} title={t('Ponownie połącz konto Outlook, żeby zaimportować kontakty z Outlooka (jednorazowa zgoda).')}
            style={{ ...btnStyle, opacity: connecting ? .6 : 1 }}>🔄 {connecting ? t('Łączenie…') : t('Odśwież połączenie')}</button>
          <button onClick={openSignatureSettings} style={btnStyle}>⚙️ {t('Ustawienia poczty')}</button>
        </div>
      } />

      {view === 'contacts' ? (
        <div style={{ padding: '16px 22px', maxWidth: 760 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{t('Kontakty')}</div>
            <button onClick={() => setContactForm({ name: '', email: '', company: '', phone: '', notes: '' })}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + {t('Nowy kontakt')}
            </button>
          </div>
          {contactForm && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder={t('Imię i nazwisko')} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                <input value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder={t('E-mail')} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                <input value={contactForm.company} onChange={e => setContactForm(f => ({ ...f, company: e.target.value }))} placeholder={t('Firma')} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                <input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('Telefon')} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <textarea value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('Notatki…')} rows={2} style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box', marginBottom: 10, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setContactForm(null)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
                <button onClick={saveContact} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('Zapisz')}</button>
              </div>
            </div>
          )}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {contacts.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 12 }}>{t('Brak zapisanych kontaktów. Możesz zapisać nadawcę wprost z otwartej wiadomości.')}</div>}
            {contacts.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{c.name || c.email}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{c.email}{c.company ? ` · ${c.company}` : ''}{c.phone ? ` · ${c.phone}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setContactForm(c)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, cursor: 'pointer', color: C.text2 }}>{t('Edytuj')}</button>
                  <button onClick={() => deleteContact(c.id)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, cursor: 'pointer', color: C.red }}>{t('Usuń')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 14, padding: '16px 22px', height: 'calc(100vh - 150px)', boxSizing: 'border-box' }}>
        {/* Kolumna: foldery */}
        {!isMobile && (
          <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            <button onClick={() => setComposeOpen(true)}
              style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {t('✏️ Nowa wiadomość')}
            </button>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: .4, padding: '2px 8px', marginBottom: 2 }}>{t('Ulubione')}</div>
            {orderedFolders.slice(0, 2).map(f => {
              const count = unreadCount(f.key)
              return (
                <div key={`fav-${f.key}`} onClick={() => { setFolder(f.key); setFocusTab('focused'); setSelectedThreadId(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: folder === f.key ? C.blight : 'transparent', color: folder === f.key ? C.blue : C.text2, fontSize: 12.5, fontWeight: folder === f.key ? 700 : 500 }}>
                  <span>{f.icon}</span><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                  {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: C.red, color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
                </div>
              )
            })}
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: .4, padding: '10px 8px 2px' }}>{account.ms_account_email?.split('@')[0]}</div>
            {orderedFolders.map(f => {
              const count = unreadCount(f.key)
              return (
                <div key={f.key} onClick={() => { setFolder(f.key); setFocusTab('focused'); setSelectedThreadId(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: folder === f.key ? C.blight : 'transparent', color: folder === f.key ? C.blue : C.text2, fontSize: 12.5, fontWeight: folder === f.key ? 700 : 500 }}>
                  <span>{f.icon}</span><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                  {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: C.red, color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Kolumna: lista wątków */}
        {showList && (
          <div style={{ width: isMobile ? '100%' : 360, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('🔍 Szukaj w poczcie…')}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, outline: 'none', boxSizing: 'border-box' }} />
              {isMobile && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto' }}>
                  {orderedFolders.map(f => (
                    <button key={f.key} onClick={() => { setFolder(f.key); setFocusTab('focused'); setSelectedThreadId(null) }}
                      style={{ flexShrink: 0, padding: '6px 8px', borderRadius: 8, border: `1px solid ${folder === f.key ? C.blue : C.border}`, background: folder === f.key ? C.blight : 'transparent', color: folder === f.key ? C.blue : C.text2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {f.icon} {f.label}
                    </button>
                  ))}
                  <button onClick={() => setComposeOpen(true)} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>✏️</button>
                </div>
              )}
              {/* Pasek narzędzi */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setQuickStepsOpen(v => !v)} style={btnStyle}>⚡ {t('Szybkie kroki')}</button>
                  {quickStepsOpen && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.15)', minWidth: 220, padding: 6 }}>
                      {quickSteps.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: C.muted }}>{t('Brak szybkich kroków.')}</div>}
                      {quickSteps.map(qs => (
                        <div key={qs.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, cursor: selectedThread ? 'pointer' : 'default', opacity: selectedThread ? 1 : .5 }}
                          onClick={() => selectedThread && runQuickStep(qs, selectedThread)}>
                          <span style={{ fontSize: 12 }}>{qs.icon} {qs.name}</span>
                          <span onClick={(e) => { e.stopPropagation(); deleteQuickStep(qs.id) }} style={{ fontSize: 11, color: C.muted, cursor: 'pointer' }}>✕</span>
                        </div>
                      ))}
                      <div onClick={() => { setNewQuickStepOpen(true); setQuickStepsOpen(false) }} style={{ padding: '6px 8px', borderTop: `1px solid ${C.border}`, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>+ {t('Nowy szybki krok')}</div>
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setCategoryPickerOpen(v => !v)} style={btnStyle}>🏷️ {t('Kategorie')}</button>
                  {categoryPickerOpen && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.15)', minWidth: 220, padding: 10 }}>
                      {categories.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, flex: 1 }}>{c.name}</span>
                          <span onClick={() => deleteCategory(c.id)} style={{ fontSize: 11, color: C.muted, cursor: 'pointer' }}>✕</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                        <input type="color" value={newCategory.color} onChange={e => setNewCategory(c => ({ ...c, color: e.target.value }))} style={{ width: 28, height: 28, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
                        <input value={newCategory.name} onChange={e => setNewCategory(c => ({ ...c, name: e.target.value }))} placeholder={t('Nowa kategoria')} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 11.5 }} />
                        <button onClick={saveCategory} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: C.blue, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {folder === 'inbox' && (
              <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
                <div onClick={() => setFocusTab('focused')} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: focusTab === 'focused' ? C.blue : C.muted, borderBottom: focusTab === 'focused' ? `2px solid ${C.blue}` : '2px solid transparent' }}>{t('Priorytetowe')}</div>
                <div onClick={() => setFocusTab('other')} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: focusTab === 'other' ? C.blue : C.muted, borderBottom: focusTab === 'other' ? `2px solid ${C.blue}` : '2px solid transparent' }}>{t('Inne')} {otherCount > 0 ? `(${otherCount})` : ''}</div>
              </div>
            )}

            <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
              {threads.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 11.5 }}>{t('Brak wiadomości.')}</div>
              )}
{threads.map(th => {
                const unread = th.all.some(m => m.direction === 'inbound' && !m.is_read)
                const active = th.key === selectedThreadId
                const cats = categories.filter(c => (th.latest.category_ids || []).includes(c.id))
                const flagged = !!th.latest.is_flagged
                return (
                  <div key={th.key} onClick={() => openThread(th)} className="poczta-thread-row"
                    style={{ padding: '11px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: active ? C.blight : 'transparent', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: unread ? 800 : 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 175 }}>
                        {th.latest.direction === 'outbound' ? (th.latest.to_addresses || []).map(a => a.address).join(', ') || t('(brak odbiorcy)') : (th.latest.from_name || th.latest.from_address || t('(nieznany nadawca)'))}
                      </span>
                      <span style={{ fontSize: 9.5, color: C.muted, flexShrink: 0 }}>{timeLabel(th.latest.received_at)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: unread ? 700 : 500, color: C.text2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.latest.has_attachments && '📎 '}{displaySubject(th.latest) || t('(brak tematu)')}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayPreview(th.latest)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {unread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue }} />}
                      {cats.map(c => <span key={c.id} style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} title={c.name} />)}
                    </div>
                    {/* Szybkie akcje na wierszu — widoczne po najechaniu (desktop) lub zawsze (mobile) */}
                    <div className="poczta-thread-row-actions" style={{ position: 'absolute', top: 8, right: 8, display: isMobile ? 'flex' : 'none', gap: 4, background: active ? C.blight : C.white, borderRadius: 6, padding: 2 }}>
                      <span onClick={(e) => { e.stopPropagation(); toggleThreadFlag(th) }} title={flagged ? t('Odflaguj') : t('Oflaguj')}
                        style={{ fontSize: 12, cursor: 'pointer', opacity: flagged ? 1 : 0.45 }}>🚩</span>
                      <span onClick={(e) => { e.stopPropagation(); applyActionToThread(th, unread ? 'mark_read' : 'mark_unread') }} title={unread ? t('Oznacz jako przeczytane') : t('Oznacz jako nieprzeczytane')}
                        style={{ fontSize: 12, cursor: 'pointer', opacity: 0.55 }}>{unread ? '📧' : '📩'}</span>
                      {folder === 'deleteditems' ? (
                        <span onClick={(e) => { e.stopPropagation(); deleteThreadPermanently(th) }} title={t('Usuń na stałe')} style={{ fontSize: 12, cursor: 'pointer', opacity: 0.55 }}>❌</span>
                      ) : (
                        <span onClick={(e) => { e.stopPropagation(); applyActionToThread(th, 'trash') }} title={t('Usuń')} style={{ fontSize: 12, cursor: 'pointer', opacity: 0.55 }}>🗑️</span>
                      )}
                    </div>
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
                <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{displaySubject(selectedMessages[0]) || t('(brak tematu)')}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={openForward} style={{ ...btnStyle, borderColor: C.blue, color: C.blue }}>↪ {t('Prześlij dalej')}</button>
{folder !== 'deleteditems' && folder !== 'archive' && <button onClick={() => applyActionToThread(selectedThread, 'archive')} style={btnStyle}>🗄️ {t('Archiwizuj')}</button>}
                    {folder !== 'junkemail' && folder !== 'deleteditems' && <button onClick={() => applyActionToThread(selectedThread, 'spam')} style={btnStyle}>🚫 {t('To spam')}</button>}
                    {folder !== 'deleteditems' && <button onClick={() => applyActionToThread(selectedThread, 'trash')} style={btnStyle}>🗑️ {t('Usuń')}</button>}
                    {(folder === 'deleteditems' || folder === 'junkemail') && <button onClick={() => applyActionToThread(selectedThread, 'restore')} style={btnStyle}>↩️ {t('Przywróć')}</button>}
                    {folder === 'deleteditems' && <button onClick={() => deleteThreadPermanently(selectedThread)} style={{ ...btnStyle, color: C.red }}>❌ {t('Usuń na stałe')}</button>}
                    <button onClick={() => toggleThreadFlag(selectedThread)} style={{ ...btnStyle, color: selectedThread.latest.is_flagged ? '#D97706' : C.text2 }}>
                      {selectedThread.latest.is_flagged ? '🚩 ' + t('Odflaguj') : '🚩 ' + t('Oflaguj')}
                    </button>
                    <button onClick={() => applyActionToThread(selectedThread, lastInboundMessage?.is_read ? 'mark_unread' : 'mark_read')} style={btnStyle}>
                      {lastInboundMessage?.is_read ? '📩 ' + t('Nieprzeczytane') : '📧 ' + t('Przeczytane')}
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
                  {selectedMessages.map(m => {
                    // Obrazki osadzone w podpisie/treści (isInline=true w Graph) NIE
                    // pokazujemy jako załączniki do pobrania — dokładnie jak Outlook,
                    // który renderuje je wewnątrz treści maila (patrz resolveInlineImages).
                    const atts = (threadAttachments[m.id] || []).filter(a => !a.is_inline)
                    return (
                      <div key={m.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                              {m.direction === 'outbound' ? (account.ms_account_email) : (m.from_name || m.from_address)}
                              {m.direction !== 'outbound' && m.from_address && (
                                <span onClick={() => saveSenderAsContact(m)} title={t('Zapisz jako kontakt')} style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: C.blue, cursor: 'pointer' }}>💾 {t('Zapisz kontakt')}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 10.5, color: C.muted }}>
                              {t('do')}: {(m.to_addresses || []).map(a => a.address).join(', ') || '—'}
                            </div>
                          </div>
                          <span style={{ fontSize: 10.5, color: C.muted, flexShrink: 0 }}>{new Date(m.received_at).toLocaleString('pl-PL')}</span>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {categories.map(c => {
                            const active = (m.category_ids || []).includes(c.id)
                            return (
                              <span key={c.id} onClick={() => toggleMessageCategory(m, c.id)}
                                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${active ? c.color : C.border}`, background: active ? c.color + '22' : 'transparent', color: active ? c.color : C.muted, fontWeight: 600 }}>
                                {c.name}
                              </span>
                            )
                          })}
                        </div>

                        {m.direction !== 'outbound' && (
                          <div style={{ marginBottom: 8 }}>
                            {m.ai_summary ? (
                              <div style={{ background: C.blight, border: `1px solid ${C.bmid}`, borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: C.text2 }}>
                                🤖 <b>{t('Podsumowanie AI')}:</b> {m.ai_summary}
                              </div>
                            ) : (
                              <button onClick={() => handleSummarize(m)} disabled={summarizing} style={{ ...btnStyle, opacity: summarizing ? .6 : 1 }}>🤖 {summarizing ? t('Podsumowuję…') : t('Podsumuj tę wiadomość')}</button>
                            )}
                          </div>
                        )}

                        {wantsTranslation(m) && m.translated_body ? (
                          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>🌐 {t('Przetłumaczono automatycznie')}</div>
                            {m.translated_body}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: resolvedBodyHtml[m.id] || m.body_html || m.body_preview || '' }} />
                        )}

                        {atts.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                            {atts.map(a => (
                              <AttachmentCard key={a.id} fileName={a.filename} subtitle={formatBytes(a.size_bytes)} onClick={() => downloadAttachment(a)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {folder !== 'sentitems' && folder !== 'drafts' && (
                  <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}` }}>
                    <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder={t('Napisz odpowiedź…')}
                      rows={3}
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    {replyAttachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {replyAttachments.map((a, i) => (
                          <span key={i} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: C.blight, color: C.text2 }}>
                            📎 {a.filename} <span onClick={() => setReplyAttachments(prev => prev.filter((_, idx) => idx !== i))} style={{ cursor: 'pointer', marginLeft: 4 }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                      <input ref={replyFileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { addFilesTo(e.target.files, setReplyAttachments); e.target.value = '' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => replyFileRef.current?.click()} style={btnStyle}>📎 {t('Załącz plik')}</button>
                        <button onClick={() => setAttachFromAppTarget('reply')} style={btnStyle}>🗂 {t('Z aplikacji')}</button>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
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
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      )}

      {composeOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setComposeOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 520, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t('Nowa wiadomość')}</div>
            <AddressField value={compose.to} onChange={v => setCompose(c => ({ ...c, to: v }))} placeholder={t('Do (adresy oddzielone przecinkiem)')} people={knownPeople} />
            <AddressField value={compose.cc} onChange={v => setCompose(c => ({ ...c, cc: v }))} placeholder={t('DW (opcjonalnie)')} people={knownPeople} />
            <input value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))} placeholder={t('Temat')}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
            <textarea value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))} placeholder={t('Treść wiadomości…')} rows={8}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            {compose.attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {compose.attachments.map((a, i) => (
                  <span key={i} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: C.blight, color: C.text2 }}>
                    📎 {a.filename} <span onClick={() => setCompose(c => ({ ...c, attachments: c.attachments.filter((_, idx) => idx !== i) }))} style={{ cursor: 'pointer', marginLeft: 4 }}>✕</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <input ref={composeFileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { addFilesTo(e.target.files, (fn) => setCompose(c => ({ ...c, attachments: fn(c.attachments) }))); e.target.value = '' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => composeFileRef.current?.click()} style={btnStyle}>📎 {t('Załącz plik')}</button>
                <button onClick={() => setAttachFromAppTarget('compose')} style={btnStyle}>🗂 {t('Z aplikacji')}</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setComposeOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
                <button onClick={handleSendCompose} disabled={sending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
                  {sending ? t('Wysyłanie…') : t('Wyślij')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {forwardOpen && selectedThread && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setForwardOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>↪ {t('Prześlij dalej')}</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Fwd: {displaySubject(selectedThread.latest) || t('(brak tematu)')}
            </div>
            <AddressField value={forwardTo} onChange={setForwardTo} placeholder={t('Do (adresy oddzielone przecinkiem)')} people={knownPeople} />
            <AddressField value={forwardCc} onChange={setForwardCc} placeholder={t('DW (opcjonalnie)')} people={knownPeople} />
            <textarea value={forwardComment} onChange={e => setForwardComment(e.target.value)} placeholder={t('Dodaj komentarz (opcjonalnie)…')} rows={4}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 14 }}>
              {t('Załączniki oryginalnej wiadomości zostaną przekazane odbiorcy automatycznie.')}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={forwardTask.create} onChange={e => setForwardTask(ft => ({ ...ft, create: e.target.checked }))} />
              {t('Utwórz też zadanie dla…')}
            </label>

            {forwardTask.create && (
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Przypisz do')}</label>
                <select value={forwardTask.assignedTo} onChange={e => setForwardTask(ft => ({ ...ft, assignedTo: e.target.value }))}
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }}>
                  <option value="">{t('— wybierz osobę —')}</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.id === session?.user?.id ? ' ' + t('(ja)') : ''}</option>)}
                </select>

                <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Tytuł zadania')}</label>
                <input value={forwardTask.title} onChange={e => setForwardTask(ft => ({ ...ft, title: e.target.value }))}
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }} />

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Klient (opcjonalnie)')}</label>
                    <select value={forwardTask.clientId} onChange={e => setForwardTask(ft => ({ ...ft, clientId: e.target.value, projectId: '' }))}
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, boxSizing: 'border-box' }}>
                      <option value="">{t('— brak —')}</option>
                      {taskClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Zamówienie (opcjonalnie)')}</label>
                    <select value={forwardTask.projectId} onChange={e => setForwardTask(ft => ({ ...ft, projectId: e.target.value }))} disabled={!forwardTask.clientId}
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, boxSizing: 'border-box' }}>
                      <option value="">{t('— brak —')}</option>
                      {taskProjects.filter(p => p.client_id === forwardTask.clientId).map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
                    </select>
                  </div>
                </div>

                <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Termin (opcjonalnie)')}</label>
                <input type="date" value={forwardTask.dueDate} onChange={e => setForwardTask(ft => ({ ...ft, dueDate: e.target.value }))}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, boxSizing: 'border-box' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setForwardOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
              <button onClick={handleForward} disabled={sending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
                {sending ? t('Wysyłanie…') : t('↪ Prześlij dalej')}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSettingsOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>⚙️ {t('Ustawienia poczty')}</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14 }}>{t('Podpis dołączany automatycznie do nowych wiadomości, odpowiedzi i przekazań.')}</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={sigForm.enabled} onChange={e => setSigForm(f => ({ ...f, enabled: e.target.checked }))} />
              {t('Dołączaj podpis automatycznie do wiadomości')}
            </label>

            <div style={{ opacity: sigForm.enabled ? 1 : .5, pointerEvents: sigForm.enabled ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Imię i nazwisko')}</label>
                  <input value={sigForm.fullName} onChange={e => setSigForm(f => ({ ...f, fullName: e.target.value }))}
                    style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Stanowisko')}</label>
                  <input value={sigForm.title} onChange={e => setSigForm(f => ({ ...f, title: e.target.value }))} placeholder={t('np. Co-founder')}
                    style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
              </div>
              <label style={{ fontSize: 10.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('Telefon')}</label>
              <input value={sigForm.phone} onChange={e => setSigForm(f => ({ ...f, phone: e.target.value }))} placeholder="+48 ..."
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 10 }}>{t('E-mail w podpisie: ')}<b>{account.ms_account_email}</b> ({t('z połączonego konta, bez możliwości zmiany')})</div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={sigForm.includeLogo} onChange={e => setSigForm(f => ({ ...f, includeLogo: e.target.checked }))} />
                {t('Dołącz grafikę logo MyChinaPal')}
              </label>

              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>{t('Podgląd')}</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', background: C.bg, marginBottom: 16 }}
                dangerouslySetInnerHTML={{ __html: buildSignatureHtml({
                  fullName: sigForm.fullName, title: sigForm.title, phone: sigForm.phone,
                  email: account.ms_account_email, includeLogo: sigForm.includeLogo,
                }) || `<span style="font-size:11px;color:${C.muted}">${t('Brak danych do podglądu.')}</span>` }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSettingsOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
              <button onClick={handleSaveSignature} disabled={savingSig} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingSig ? .6 : 1 }}>
                {savingSig ? t('Zapisywanie…') : t('Zapisz')}
              </button>
            </div>
          </div>
        </div>
      )}

      {newQuickStepOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setNewQuickStepOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 380, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{t('Nowy szybki krok')}</div>
            <input value={newQuickStep.name} onChange={e => setNewQuickStep(q => ({ ...q, name: e.target.value }))} placeholder={t('Nazwa (np. "Archiwizuj i oznacz przeczytane")')}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={newQuickStep.markRead} onChange={e => setNewQuickStep(q => ({ ...q, markRead: e.target.checked }))} />
              {t('Oznacz jako przeczytane')}
            </label>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{t('Przenieś do:')}</div>
            {[['archive', '🗄️ Archiwum'], ['trash', '🗑️ Elementy usunięte'], [null, '— (nie przenoś)']].map(([val, label]) => (
              <label key={String(val)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                <input type="radio" name="qs-dest" checked={newQuickStep.destination === val} onChange={() => setNewQuickStep(q => ({ ...q, destination: val }))} />
                {t(label)}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setNewQuickStepOpen(false)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, cursor: 'pointer', color: C.text2 }}>{t('Anuluj')}</button>
              <button onClick={saveQuickStep} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('Zapisz')}</button>
            </div>
          </div>
        </div>
      )}
      {previewFile && <FilePreviewModal url={previewFile.url} fileName={previewFile.fileName} onClose={() => setPreviewFile(null)} />}
      {attachFromAppTarget && (
        <AttachFromAppModal onClose={() => setAttachFromAppTarget(null)} onAttach={handleAttachFromApp} />
      )}
    </div>
  )
}
