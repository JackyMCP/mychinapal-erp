import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import { MODULES, ZARZAD_ONLY_PATHS } from './Sidebar'

const KIND_ICON = {
  'Moduł': '', 'Klient': '🧑‍💼', 'Zamówienie': '📦', 'Dokument': '📄', 'Zadanie': '✅', 'Wiadomość': '💬', 'Towar': '🗃️',
}

export default function CommandPalette() {
  const { t } = useLang()
  const { isZarzad } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [searching, setSearching] = useState(false)
  const [dataResults, setDataResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) { setQuery(''); setDebouncedQuery(''); setDataResults([]); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // debounce — żeby nie odpalać zapytań do bazy przy każdym naciśnięciu klawisza
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 260)
    return () => clearTimeout(id)
  }, [query])

  // wyszukiwanie realne, po stronie bazy, we WSZYSTKICH modułach naraz — po polsku i po
  // chińsku jednocześnie (treść wiadomości mamy zapisaną w obu wersjach: content + translated_content,
  // więc szukanie chińskiego słowa znajdzie polską wiadomość i odwrotnie, bez dodatkowej logiki)
  useEffect(() => {
    const q = debouncedQuery
    if (!open || q.length < 2) { setDataResults([]); return }
    let cancelled = false
    setSearching(true)
    ;(async () => {
      const like = `%${q}%`
      const [clientsRes, projectsRes, docsRes, tasksRes, msgsRes, productsRes] = await Promise.all([
        supabase.from('clients').select('id,name').ilike('name', like).limit(6),
        supabase.from('projects').select('id,order_label,client_id').ilike('order_label', like).limit(6),
        supabase.from('documents').select('id,file_name,client_id,project_id').ilike('file_name', like).limit(6),
        supabase.from('tasks').select('id,title,client_id').ilike('title', like).limit(6),
        supabase.from('chat_messages').select('id,channel_id,content,translated_content').or(`content.ilike.${like},translated_content.ilike.${like}`).limit(6),
        supabase.from('products').select('id,name').ilike('name', like).limit(6),
      ])
      if (cancelled) return
      setDataResults([
        ...(clientsRes.data || []).map(c => ({ kind: 'Klient', label: c.name, go: () => navigate(`/klienci?client=${c.id}`) })),
        ...(projectsRes.data || []).map(p => ({ kind: 'Zamówienie', label: p.order_label, go: () => navigate(`/projekty?project=${p.id}`) })),
        ...(docsRes.data || []).map(d => ({ kind: 'Dokument', label: d.file_name, go: () => navigate(d.project_id ? `/projekty?project=${d.project_id}` : `/klienci?client=${d.client_id}`) })),
        ...(tasksRes.data || []).map(x => ({ kind: 'Zadanie', label: x.title, go: () => navigate(x.client_id ? `/klienci?client=${x.client_id}` : '/moje-zadania') })),
        ...(msgsRes.data || []).map(m => ({ kind: 'Wiadomość', label: (m.content || m.translated_content || '').slice(0, 70), go: () => navigate(`/czat?channel=${m.channel_id}`) })),
        ...(productsRes.data || []).map(p => ({ kind: 'Towar', label: p.name, go: () => navigate('/magazyn') })),
      ])
      setSearching(false)
    })()
    return () => { cancelled = true }
  }, [debouncedQuery, open, navigate])

  const modules = useMemo(() => MODULES.filter(m => isZarzad || !ZARZAD_ONLY_PATHS.includes(m.path)), [isZarzad])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const modRows = modules
      .filter(m => !q || t(m.label).toLowerCase().includes(q))
      .map(m => ({ kind: 'Moduł', icon: m.icon, label: t(m.label), go: () => navigate(m.path) }))
    if (!q) return modRows.slice(0, 14)
    return [...dataResults, ...modRows].slice(0, 20)
  }, [query, modules, dataResults, t, navigate])

  useEffect(() => { setSel(0) }, [query, dataResults])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (r) { r.go(); setOpen(false) } }
  }

  if (!open) return null

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 9997, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', backdropFilter: 'blur(2px)' }}>
      <style>{`@keyframes cmdIn { from { opacity: 0; transform: translateY(-10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes cmdSpin { to { transform: rotate(360deg); } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '90vw', borderRadius: 16, boxShadow: '0 30px 70px rgba(0,0,0,.35)', overflow: 'hidden', animation: 'cmdIn .18s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={t('Szukaj czegokolwiek: klienta, zamówienia, dokumentu, zadania, wiadomości, towaru… (PL / 中文)')}
            style={{ flex: 1, border: 'none', padding: '16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          {searching && <div style={{ width: 14, height: 14, marginRight: 16, border: `2px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'cmdSpin .6s linear infinite' }} />}
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {results.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: C.muted, textAlign: 'center' }}>
              {query ? (searching ? t('Szukam…') : t('Brak wyników.')) : t('Zacznij pisać, albo wybierz moduł poniżej.')}
            </div>
          )}
          {results.map((r, i) => (
            <div key={r.kind + r.label + i} onClick={() => { r.go(); setOpen(false) }} onMouseEnter={() => setSel(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: sel === i ? C.blight : 'transparent' }}>
              <span style={{ fontSize: 15 }}>{r.icon || KIND_ICON[r.kind] || '🔎'}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.muted, background: C.bg, padding: '2px 7px', borderRadius: 6, flexShrink: 0 }}>{t(r.kind)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 14px', fontSize: 10, color: C.muted, display: 'flex', gap: 12 }}>
          <span>↑↓ {t('nawigacja')}</span><span>↵ {t('otwórz')}</span><span>Esc {t('zamknij')}</span>
        </div>
      </div>
    </div>
  )
}
