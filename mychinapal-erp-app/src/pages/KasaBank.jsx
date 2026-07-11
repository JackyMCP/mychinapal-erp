import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { C, fmt } from '../lib/theme'
import { QUARTERS, Q_LABELS, isHelperRow } from '../components/kasabank/constants'
import TabTransakcje from '../components/kasabank/TabTransakcje'
import TabKontrolaKasy from '../components/kasabank/TabKontrolaKasy'
import TabVAT from '../components/kasabank/TabVAT'
import TabMarza from '../components/kasabank/TabMarza'
import TabCykliczne from '../components/kasabank/TabCykliczne'
import TabPrognoza from '../components/kasabank/TabPrognoza'

function mapTx(row) {
  return {
    id: row.id,
    q: row.quarter,
    date: row.tx_date,
    contractor: row.contractor,
    desc: row.description,
    amount: Number(row.amount) || 0,
    direction: row.direction,
    assign: row.clients?.name || '',
    client_id: row.client_id,
    order: row.projects?.order_label || '',
    project_id: row.project_id,
    flow_type: row.flow_type,
    status: row.status,
    margin: Number(row.margin) || 0,
    category: row.category,
    notes: row.notes,
    account: row.account,
    currency: row.currency,
    vat_rate: Number(row.vat_rate) || 0,
    vat_calc: Number(row.vat_amount) || 0,
  }
}

export default function KasaBank() {
  const { isZarzad } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [txs, setTxs] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [kk, setKk] = useState({})
  const [stanKont, setStanKont] = useState([])
  const [vatSummary, setVatSummary] = useState([])
  const [marzaK, setMarzaK] = useState([])
  const [marzaZ, setMarzaZ] = useState([])
  const [recurring, setRecurring] = useState([])
  const [tab, setTab] = useState('transakcje')
  const [selQ, setSelQ] = useState('Q2_2026')

  useEffect(() => {
    if (!isZarzad) { setLoading(false); return }
    (async () => {
      setLoading(true)
      const [txRes, clientsRes, projectsRes, kkRes, abRes, vatRes, mkRes, mzRes, rpRes] = await Promise.all([
        supabase.from('transactions').select('*, clients(id,name), projects(id,order_label)').order('tx_date'),
        supabase.from('clients').select('id,name').order('name'),
        supabase.from('projects').select('id,client_id,order_label'),
        supabase.from('report_kontrola_kasy').select('*'),
        supabase.from('account_balances').select('*'),
        supabase.from('report_vat_summary').select('*').order('sort_order'),
        supabase.from('report_marza_klient').select('*'),
        supabase.from('report_marza_zlecenie').select('*'),
        supabase.from('recurring_payments').select('*').order('day_of_month'),
      ])
      for (const [name, res] of Object.entries({ txRes, clientsRes, projectsRes, kkRes, abRes, vatRes, mkRes, mzRes, rpRes })) {
        if (res.error) console.error(name, res.error.message)
      }

      setTxs((txRes.data || []).map(mapTx))
      setClients(clientsRes.data || [])
      setProjects(projectsRes.data || [])

      const kkShaped = {}
      ;(kkRes.data || []).forEach(r => {
        kkShaped[r.row_label] = kkShaped[r.row_label] || {}
        kkShaped[r.row_label][r.quarter] = Number(r.value)
      })
      setKk(kkShaped)

      const abByAccount = {}
      ;(abRes.data || []).forEach(r => {
        const key = r.account_label
        abByAccount[key] = abByAccount[key] || { label: r.account_label, cur: r.currency, vals: [0, 0, 0, 0, 0, 0, 0] }
        const qi = QUARTERS.indexOf(r.quarter)
        if (qi >= 0) abByAccount[key].vals[qi] = Number(r.balance)
      })
      setStanKont(Object.values(abByAccount))

      setVatSummary((vatRes.data || []).map(r => ({ label: r.label, value: Number(r.value), description: r.description })))
      setMarzaK((mkRes.data || []).map(r => ({ k: r.client_name, client_id: r.client_id, p: Number(r.przychod), z: Number(r.zakup), t: Number(r.transport), c: Number(r.clo), m: Number(r.marza), mp: Number(r.marza_pct), vn: Number(r.vat_nalezny), vi: Number(r.vat_import) })))
      setMarzaZ((mzRes.data || []).map(r => ({ k: r.client_name, client_id: r.client_id, z: r.order_label, project_id: r.project_id, p: Number(r.przychod), zk: Number(r.zakup), t: Number(r.transport), c: Number(r.clo), vi: Number(r.vat_import), m: Number(r.marza), s: r.status, active: r.active })))
      setRecurring(rpRes.data || [])
      setLoading(false)
    })()
  }, [isZarzad])

  const handleSave = async (id, changes) => {
    const { error } = await supabase.from('transactions').update(changes).eq('id', id)
    if (error) { console.error(error); alert('Nie udało się zapisać zmian: ' + error.message); return }
    const client = clients.find(c => c.id === changes.client_id)
    const project = projects.find(p => p.id === changes.project_id)
    setTxs(prev => prev.map(t => t.id === id ? {
      ...t, ...changes,
      assign: client?.name || '',
      order: project?.order_label || '',
    } : t))
  }

  const podatkiPayments = useMemo(() => (
    txs.filter(t => (t.category || '').toUpperCase() === 'PODATKI' && t.direction === 'MA-')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(t => ({ date: t.date, label: t.desc || t.contractor, amount: t.amount }))
  ), [txs])

  if (!isZarzad) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Brak dostępu</div>
        <div style={{ fontSize: 12, color: C.muted }}>Dane finansowe (Kasa & Bank) widoczne są wyłącznie dla Zarządu.</div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>Ładowanie danych finansowych…</div>

  const qi = QUARTERS.indexOf(selQ)
  const getKK = (label, q) => (kk[label] && kk[label][q]) || 0
  const unassignedCount = txs.filter(t => !isHelperRow(t) && ['WN+', 'MA-'].includes(t.direction) && !t.assign).length
  const weryfikacjaCount = txs.filter(t => (t.category || '').includes('WERYFIKACJI')).length
  const alerts = unassignedCount + weryfikacjaCount

  const TABS = [
    { k: 'transakcje', l: 'Transakcje', badge: alerts > 0 ? alerts : null, danger: alerts > 0 },
    { k: 'kontrola', l: 'Kontrola kasy' },
    { k: 'vat', l: 'VAT & JPK' },
    { k: 'marza', l: 'Marża per klient' },
    { k: 'cykliczne', l: 'Płatności cykliczne' },
    { k: 'prognoza', l: 'Prognoza 30 dni' },
  ]

  const goClient = (clientId) => navigate(`/klienci?client=${clientId}`)

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>Kasa & Bank</div>
          <div style={{ fontSize: 10, color: C.muted }}>{txs.length} transakcji w rejestrze · {alerts} do przypisania</div>
        </div>
        {alerts > 0 && <div style={{ background: C.rlight, border: `1px solid ${C.rmid}`, borderRadius: 6, padding: '4px 9px', fontSize: 10.5, color: C.red, fontWeight: 700 }}>⚠️ {alerts} wymaga przypisania</div>}
        <div style={{ display: 'flex', gap: 3 }}>
          {QUARTERS.map((q, i) => (
            <div key={q} onClick={() => setSelQ(q)} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 10.5, cursor: 'pointer', fontWeight: 600, border: `1px solid ${selQ === q ? C.blue : C.border}`, background: selQ === q ? C.blue : 'transparent', color: selQ === q ? '#fff' : C.muted }}>{Q_LABELS[i]}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 20px 20px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, marginBottom: 11 }}>
          {stanKont.filter(s => s.cur !== 'EUR').map((s, i) => {
            const val = s.vals[qi] || 0
            return (
              <div key={i} style={{ background: i === 0 ? C.navy : C.navy2, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 21, fontWeight: 700, color: val < 0 ? '#FCA5A5' : '#fff' }}>
                  {fmt(val)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{s.cur}</span>
                </div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.32)', marginTop: 2 }}>na koniec {Q_LABELS[qi]}</div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, marginBottom: 11 }}>
          {[
            { l: 'Marża operacyjna', v: getKK('MARŻA OPERACYJNA', selQ), fmt: true, bl: getKK('MARŻA OPERACYJNA', selQ) >= 0 ? C.green : C.red },
            { l: 'Przychód netto', v: getKK('Przychód netto (po VAT)', selQ), fmt: true, bl: C.blue },
            { l: 'Podatki', v: getKK('Podatki (CIT/VAT/ZUS)', selQ), fmt: true, bl: C.purple },
            { l: 'Nierozliczonych', v: getKK('Nierozliczonych', selQ), fmt: false, bl: getKK('Nierozliczonych', selQ) > 0 ? C.orange : C.green, delta: `Rozliczonych: ${getKK('Rozliczonych całkowicie', selQ)}` },
          ].map((k, i) => (
            <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', borderLeft: `3px solid ${k.bl}` }}>
              <div style={{ fontSize: 9.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k.l} — {Q_LABELS[qi]}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: k.bl }}>{k.fmt ? ((k.v > 0 ? '+' : '') + fmt(k.v, 0) + ' PLN') : k.v}</div>
              {k.delta && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{k.delta}</div>}
            </div>
          ))}
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 16px', overflowX: 'auto' }}>
            {TABS.map(t => (
              <div key={t.k} onClick={() => setTab(t.k)} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `2px solid ${tab === t.k ? C.blue : 'transparent'}`, marginBottom: -1, color: tab === t.k ? C.blue : t.danger ? C.red : C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                {t.l}
                {t.badge ? <span style={{ background: C.red, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{t.badge}</span> : null}
              </div>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            {tab === 'transakcje' && <TabTransakcje txs={txs} clients={clients} projects={projects} onSave={handleSave} />}
            {tab === 'kontrola' && <TabKontrolaKasy kk={kk} stanKont={stanKont} />}
            {tab === 'vat' && <TabVAT vatSummary={vatSummary} podatkiPayments={podatkiPayments} />}
            {tab === 'marza' && <TabMarza marzaK={marzaK} marzaZ={marzaZ} goClient={goClient} />}
            {tab === 'cykliczne' && <TabCykliczne items={recurring} />}
            {tab === 'prognoza' && <TabPrognoza items={recurring} />}
          </div>
        </div>
      </div>
    </div>
  )
}
