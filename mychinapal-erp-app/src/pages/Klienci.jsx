import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'
import { C, fmt } from '../lib/theme'

export default function Klienci() {
  const { isZarzad } = useAuth()
  const [clients, setClients] = useState([])
  const [selected, setSelected] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) console.error(error)
      setClients(data || [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!selected) { setProjects([]); return }
    (async () => {
      const { data } = await supabase.from('projects').select('*').eq('client_id', selected.id)
      setProjects(data || [])
    })()
  }, [selected])

  if (selected) {
    return (
      <div>
        <PageHeader title={selected.name} subtitle={selected.full_name || 'Brak pełnej nazwy'} />
        <div style={{ padding: '16px 22px', maxWidth: 1200 }}>
          <div onClick={() => setSelected(null)} style={{ fontSize: 11, fontWeight: 600, color: C.blue, cursor: 'pointer', marginBottom: 12 }}>← Wróć do listy klientów</div>
          <SectionCard title="Projekty klienta">
            {projects.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>Brak zarejestrowanych projektów.</div>}
            {projects.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.order_label}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{p.stage}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Notatki">
            <textarea placeholder="Dodaj notatkę…" style={{ width: '100%', minHeight: 70, border: `1px solid ${C.border}`, borderRadius: 7, padding: 8, fontSize: 11 }} />
          </SectionCard>
        </div>
      </div>
    )
  }

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <PageHeader title="Klienci & CRM" subtitle={loading ? 'Ładowanie…' : `${clients.length} kontrahentów widocznych dla Ciebie`}
        right={isZarzad && <button style={{ padding: '7px 13px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff' }}>+ Nowy klient</button>} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj klienta…"
          style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 11.5, width: 260, marginBottom: 12 }} />
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {filtered.map((c, i) => (
            <div key={c.id} onClick={() => setSelected(c)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 12, fontWeight: 600, color: C.blue }}>
              {c.name}
            </div>
          ))}
          {filtered.length === 0 && !loading && <div style={{ padding: 14, fontSize: 11, color: C.muted }}>Brak klientów do wyświetlenia.</div>}
        </div>
      </div>
    </div>
  )
}
