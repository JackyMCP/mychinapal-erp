import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { avatarColor, initials, daysSince, healthColor } from '../components/klienci/utils'
import TabPrzeglad from '../components/klienci/TabPrzeglad'
import TabZamowienia from '../components/klienci/TabZamowienia'
import TabFinanse from '../components/klienci/TabFinanse'
import TabDokumenty from '../components/klienci/TabDokumenty'
import TabCzat from '../components/klienci/TabCzat'
import TabNotatki from '../components/klienci/TabNotatki'

const TABS = ['Przegląd', 'Zamówienia', 'Finanse', 'Dokumenty', 'Czat', 'Notatki']

export default function Klienci() {
  const { isZarzad } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [clients, setClients] = useState([])
  const [marzaById, setMarzaById] = useState({})
  const [activityById, setActivityById] = useState({})
  const [projects, setProjects] = useState([])
  const [documents, setDocuments] = useState([])
  const [contacts, setContacts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('Przegląd')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [clRes, mzRes, actRes, prRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('v_marza_klient').select('*'),
        supabase.from('v_client_activity').select('*'),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ])
      if (clRes.error) console.error(clRes.error)
      setClients(clRes.data || [])
      setMarzaById(Object.fromEntries((mzRes.data || []).map(m => [m.client_id, m])))
      setActivityById(Object.fromEntries((actRes.data || []).map(a => [a.client_id, a])))
      setProjects(prRes.data || [])
      setLoading(false)

      const wanted = searchParams.get('client')
      if (wanted) setSelectedId(wanted)
    })()
  }, [])

  useEffect(() => {
    if (!selectedId) { setDocuments([]); setContacts([]); return }
    (async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('client_id', selectedId).order('created_at', { ascending: false })
      if (error) console.error(error)
      setDocuments(data || [])
    })()
    ;(async () => {
      const { data, error } = await supabase.from('client_contacts').select('*').eq('client_id', selectedId).order('created_at')
      if (error) console.error(error)
      setContacts(data || [])
    })()
  }, [selectedId])

  const filtered = useMemo(
    () => clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [clients, search]
  )
  const selected = clients.find(c => c.id === selectedId) || null
  const selectedProjects = selected ? projects.filter(p => p.client_id === selected.id) : []
  const selectedMarza = selected ? marzaById[selected.id] : null

  const lastContactDays = (act) => {
    if (!act) return null
    const times = [act.last_message_at, act.last_project_at].filter(Boolean)
    if (times.length === 0) return null
    const latest = times.sort().pop()
    return daysSince(latest)
  }

  const handleSelect = (c) => {
    setSelectedId(c.id)
    setTab('Przegląd')
    setSearchParams({ client: c.id })
  }

  const handleOpenChat = (channelId) => navigate(`/czat?channel=${channelId}`)

  return (
    <div>
      <PageHeader title="Klienci & CRM" subtitle={loading ? 'Ładowanie…' : `${clients.length} kontrahentów widocznych dla Ciebie`}
        right={isZarzad && <button style={{ padding: '7px 13px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff' }}>+ Nowy klient</button>} />
      <div style={{ padding: '16px 22px', maxWidth: 1500, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── lista klientów ── */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj klienta…"
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11.5, width: '100%', marginBottom: 10, boxSizing: 'border-box' }} />
          {filtered.map(c => {
            const act = activityById[c.id]
            const days = lastContactDays(act)
            const m = marzaById[c.id]
            const isActive = selectedId === c.id
            return (
              <div key={c.id} onClick={() => handleSelect(c)}
                style={{ padding: '10px 12px', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3, background: isActive ? C.blight : 'transparent', border: isActive ? `1px solid ${C.bmid}` : '1px solid transparent' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(c.name) }}>{initials(c.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{act?.project_count || 0} zamówień{m ? ` · ${Math.round(Number(m.przychod) || 0).toLocaleString('pl-PL')} PLN` : ''}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: healthColor(days) }} title={days === null ? 'brak danych o kontakcie' : `ostatni kontakt ${days} dni temu`} />
              </div>
            )
          })}
          {filtered.length === 0 && !loading && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>Brak klientów do wyświetlenia.</div>}
        </div>

        {/* ── rekord 360° ── */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, minHeight: 400 }}>
          {!selected && <div style={{ fontSize: 12, color: C.muted, padding: 20, textAlign: 'center' }}>Wybierz klienta z listy po lewej, żeby zobaczyć pełny widok 360°.</div>}
          {selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(selected.name) }}>{initials(selected.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{selected.full_name || 'Brak pełnej nazwy'}{selected.created_at ? ` · Klient od ${new Date(selected.created_at).toLocaleDateString('pl-PL')}` : ''}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
                {TABS.map(t => (
                  <div key={t} onClick={() => setTab(t)}
                    style={{ padding: '9px 14px', fontSize: 11.5, fontWeight: 600, color: tab === t ? C.blue : C.muted, cursor: 'pointer', borderBottom: tab === t ? `2px solid ${C.blue}` : '2px solid transparent', marginBottom: -1 }}>
                    {t}{t === 'Zamówienia' ? ` (${selectedProjects.length})` : ''}{t === 'Dokumenty' ? ` (${documents.length})` : ''}
                  </div>
                ))}
              </div>

              {tab === 'Przegląd' && <TabPrzeglad client={selected} marza={selectedMarza} projects={selectedProjects} contacts={contacts} lastContactDays={lastContactDays(activityById[selected.id])} />}
              {tab === 'Zamówienia' && <TabZamowienia projects={selectedProjects} />}
              {tab === 'Finanse' && <TabFinanse marza={selectedMarza} />}
              {tab === 'Dokumenty' && <TabDokumenty documents={documents} />}
              {tab === 'Czat' && <TabCzat clientId={selected.id} projectIds={selectedProjects.map(p => p.id)} onOpenChat={handleOpenChat} />}
              {tab === 'Notatki' && <TabNotatki client={selected} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
