import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import { MODULES, ZARZAD_ONLY_PATHS } from './Sidebar'

export default function CommandPalette() {
  const { t } = useLang()
  const { isZarzad } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded] = useState(false)
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
    if (open && !loaded) {
      (async () => {
        const [{ data: cl }, { data: pr }] = await Promise.all([
          supabase.from('clients').select('id,name').order('name'),
          supabase.from('projects').select('id,order_label,client_id').order('created_at', { ascending: false }),
        ])
        setClients(cl || [])
        setProjects(pr || [])
        setLoaded(true)
      })()
    }
    if (open) { setQuery(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open, loaded])

  const modules = useMemo(() => MODULES.filter(m => isZarzad || !ZARZAD_ONLY_PATHS.includes(m.path)), [isZarzad])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const modRows = modules
      .filter(m => !q || t(m.label).toLowerCase().includes(q))
      .map(m => ({ kind: 'Moduł', icon: m.icon, label: t(m.label), go: () => navigate(m.path) }))
    const clientRows = clients
      .filter(c => q && c.name?.toLowerCase().includes(q))
      .slice(0, 8)
      .map(c => ({ kind: 'Klient', icon: '🧑‍💼', label: c.name, go: () => navigate(`/klienci?client=${c.id}`) }))
    const projectRows = projects
      .filter(p => q && p.order_label?.toLowerCase().includes(q))
      .slice(0, 8)
      .map(p => ({ kind: 'Zamówienie', icon: '📦', label: p.order_label, go: () => navigate(`/projekty?project=${p.id}`) }))
    return [...clientRows, ...projectRows, ...modRows].slice(0, 14)
  }, [query, modules, clients, projects, t, navigate])

  useEffect(() => { setSel(0) }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (r) { r.go(); setOpen(false) } }
  }

  if (!open) return null

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 9997, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', backdropFilter: 'blur(2px)' }}>
      <style>{`@keyframes cmdIn { from { opacity: 0; transform: translateY(-10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '90vw', borderRadius: 16, boxShadow: '0 30px 70px rgba(0,0,0,.35)', overflow: 'hidden', animation: 'cmdIn .18s ease both' }}>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={t('Szukaj klienta, zamówienia, modułu…')}
          style={{ width: '100%', border: 'none', borderBottom: `1px solid ${C.border}`, padding: '16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
          {results.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: C.muted, textAlign: 'center' }}>
              {query ? t('Brak wyników.') : t('Zacznij pisać, albo wybierz moduł poniżej.')}
            </div>
          )}
          {results.map((r, i) => (
            <div key={r.kind + r.label + i} onClick={() => { r.go(); setOpen(false) }} onMouseEnter={() => setSel(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: sel === i ? C.blight : 'transparent' }}>
              <span style={{ fontSize: 15 }}>{r.icon}</span>
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
