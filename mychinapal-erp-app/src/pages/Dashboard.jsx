import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'
import { C, fmt } from '../lib/theme'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { isZarzad } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [txSum, setTxSum] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: clientsData } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
      const { data: projectsData } = await supabase.from('projects').select('*, clients(name)').eq('active', true)
      setClients(clientsData || [])
      setProjects(projectsData || [])

      if (isZarzad) {
        const { data: txData } = await supabase.from('transactions').select('amount, direction')
        if (txData) {
          const wpływy = txData.filter(t => t.direction === 'WN+').reduce((s, t) => s + Number(t.amount), 0)
          const wypływy = txData.filter(t => t.direction === 'MA-').reduce((s, t) => s + Number(t.amount), 0)
          setTxSum({ wpływy, wypływy })
        }
      }
      setLoading(false)
    })()
  }, [isZarzad])

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={loading ? 'Ładowanie…' : `${clients.length} klientów widocznych dla Ciebie · ${projects.length} aktywnych projektów`} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>
        {isZarzad && txSum && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
            <div style={{ background: C.navy, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>Wpływy (WN+)</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 }}>{fmt(txSum.wpływy, 0)} PLN</div>
            </div>
            <div style={{ background: C.navy2, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>Wypływy (MA-)</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 }}>{fmt(txSum.wypływy, 0)} PLN</div>
            </div>
          </div>
        )}

        <SectionCard title="Klienci">
          {clients.length === 0 && !loading && <div style={{ fontSize: 11, color: C.muted }}>Brak klientów widocznych dla Twojego konta — Zarząd może dodać ich w module Klienci.</div>}
          {clients.slice(0, 8).map(c => (
            <div key={c.id} onClick={() => navigate('/klienci')} style={{ padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.blue }}>
              {c.name}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Aktywne projekty">
          {projects.length === 0 && !loading && <div style={{ fontSize: 11, color: C.muted }}>Brak aktywnych projektów widocznych dla Twojego konta.</div>}
          {projects.slice(0, 8).map(p => (
            <div key={p.id} onClick={() => navigate('/projekty')} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>{p.clients?.name} — {p.order_label}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{p.stage}</span>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  )
}
