import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'
import { C } from '../lib/theme'

export default function Projekty() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data, error } = await supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false })
      if (error) console.error(error)
      setProjects(data || [])
      setLoading(false)
    })()
  }, [])

  return (
    <div>
      <PageHeader title="Projekty & Zamówienia" subtitle={loading ? 'Ładowanie…' : `${projects.length} projektów widocznych dla Ciebie`} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>
        <SectionCard>
          {projects.length === 0 && !loading && <div style={{ fontSize: 11, color: C.muted }}>Brak projektów do wyświetlenia — Zarząd może je dodać po podłączeniu klientów.</div>}
          {projects.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{p.clients?.name} — {p.order_label}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{p.stage}</div>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  )
}
