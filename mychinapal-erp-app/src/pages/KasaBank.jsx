import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { C, fmt } from '../lib/theme'
import { QUARTERS, Q_LABELS, isHelperRow, CN_CATEGORIES, CN_INTERNAL_CATEGORIES } from '../components/kasabank/constants'
import TabTransakcje from '../components/kasabank/TabTransakcje'
import TabKontrolaKasy from '../components/kasabank/TabKontrolaKasy'
import TabVAT from '../components/kasabank/TabVAT'
import TabMarza from '../components/kasabank/TabMarza'
import TabCykliczne from '../components/kasabank/TabCykliczne'
import TabPrognoza from '../components/kasabank/TabPrognoza'
import StatementUploadTile from '../components/kasabank/StatementUploadTile'
import CompanyFlagSwitch from '../components/CompanyFlagSwitch'
import ComingSoonCN from '../components/ComingSoonCN'
import useWeeklyStatementReminder from '../lib/useWeeklyStatementReminder'
import { useUI } from '../lib/ui'
import useIsMobile from '../lib/useIsMobile'

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
    company: row.company || 'PL',
  }
}

export default function KasaBank() {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()

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
  const [company, setCompany] = useState('PL')
  const [statementUploads, setStatementUploads] = useState([])

  const loadData = async () => {
    setLoading(true)
    const [txRes, clientsRes, projectsRes, kkRes, abRes, vatRes, mkRes, mzRes, rpRes, suRes] = await Promise.all([
      supabase.from('transactions').select('*, clients(id,name), projects(id,order_label)').order('tx_date'),
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('projects').select('id,client_id,order_label'),
      supabase.from('v_kontrola_kasy').select('*'),
      supabase.from('account_balances').select('*'),
      supabase.from('v_vat_summary').select('*').order('sort_order'),
      supabase.from('v_marza_klient').select('*'),
      supabase.from('v_marza_zlecenie').select('*'),
      supabase.from('recurring_payments').select('*').order('day_of_month'),
      supabase.from('bank_statement_uploads').select('*').order('uploaded_at', { ascending: false }),
    ])
    for (const [name, res] of Object.entries({ txRes, clientsRes, projectsRes, kkRes, abRes, vatRes, mkRes, mzRes, rpRes, suRes })) {
      if (res.error) console.error(name, res.error.message)
    }

    setTxs((txRes.data || []).map(mapTx))
    setClients(clientsRes.data || [])
    setProjects(projectsRes.data || [])
    setStatementUploads(suRes.data || [])

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
    setMarzaZ((mzRes.data || []).map(r => ({ k: r.client_name, client_id: r.client_id, z: r.order_label, project_id: r.project_id, p: Number(r.przychod), zk: Number(r.zakup), t: Number(r.transport), c: Number(r.clo), vi: Number(r.vat_import), m: Number(r.marza), s: r.stage, active: r.active })))
    setRecurring(rpRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!isZarzad) { setLoading(false); return }
    loadData()
  }, [isZarzad])

  const needsUploadReminder = useWeeklyStatementReminder(company)
  const lastUploadForCompany = statementUploads.find(u => u.company === company)

  const handleSave = async (id, changes) => {
    // VAT jest częścią kwoty brutto z wyciągu (amount) — przy zmianie stawki VAT
    // przeliczamy automatycznie kwotę VAT, żeby marża "netto" na zakładce Marża
    // liczyła się poprawnie bez ręcznego wyliczania.
    const current = txs.find(row => row.id === id)
    const payload = { ...changes }
    if (current && changes.vat_rate !== undefined) {
      const rate = Number(changes.vat_rate) || 0
      payload.vat_amount = rate > 0 ? Math.round(current.amount * rate / (100 + rate) * 100) / 100 : 0
    }
    const { error } = await supabase.from('transactions').update(payload).eq('id', id)
    if (error) { console.error(error); toast.error('Nie udało się zapisać zmian: ' + error.message); return }
    const client = clients.find(c => c.id === changes.client_id)
    const project = projects.find(p => p.id === changes.project_id)
    setTxs(prev => prev.map(row => row.id === id ? {
      ...row, ...payload,
      assign: client?.name || '',
      order: project?.order_label || '',
      vat_calc: payload.vat_amount !== undefined ? payload.vat_amount : row.vat_calc,
    } : row))
  }

  const podatkiPayments = useMemo(() => (
    txs.filter(row => (row.category || '').toUpperCase() === 'PODATKI' && row.direction === 'MA-' && row.flow_type !== 'nie_podlega')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(row => ({ date: row.date, label: row.desc || row.contractor, amount: row.amount }))
  ), [txs])

  if (!isZarzad) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t("Brak dostępu")}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{t("Dane finansowe (Kasa & Bank) widoczne są wyłącznie dla Zarządu.")}</div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>{t("Ładowanie danych finansowych…")}</div>;

  const qi = QUARTERS.indexOf(selQ)
  const getKK = (label, q) => (kk[label] && kk[label][q]) || 0
  const companyTxs = txs.filter(row => row.company === company)
  const unassignedCount = companyTxs.filter(row => !isHelperRow(row) && ['WN+', 'MA-'].includes(row.direction) && !row.assign).length
  const weryfikacjaCount = companyTxs.filter(row => (row.category || '').includes('WERYFIKACJI')).length
  const alerts = unassignedCount + weryfikacjaCount
  const isCN = company === 'CN'

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
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px 16px' : '10px 20px',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 10 : 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>{t("Kasa & Bank")}</div>
          <div style={{ fontSize: 10, color: C.muted }}>{companyTxs.length} {t("transakcji w rejestrze ·")} {alerts} {t("do przypisania")}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CompanyFlagSwitch value={company} onChange={c => { setCompany(c); setTab('transakcje') }} size="sm" />
          {alerts > 0 && <div style={{ background: C.rlight, border: `1px solid ${C.rmid}`, borderRadius: 6, padding: '4px 9px', fontSize: 10.5, color: C.red, fontWeight: 700, whiteSpace: 'nowrap' }}>⚠️ {alerts} {t("wymaga przypisania")}</div>}
          {!isCN && (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {QUARTERS.map((q, i) => (
                <div key={q} onClick={() => setSelQ(q)} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 10.5, cursor: 'pointer', fontWeight: 600, border: `1px solid ${selQ === q ? C.blue : C.border}`, background: selQ === q ? C.blue : 'transparent', color: selQ === q ? '#fff' : C.muted, whiteSpace: 'nowrap' }}>{Q_LABELS[i]}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      {needsUploadReminder && (
        <div style={{ background: C.olight, borderBottom: `1px solid ${C.border}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.orange, fontWeight: 600 }}>
          🔔 {t("Przypomnienie: nie wgrano jeszcze w tym tygodniu wyciągu bankowego dla spółki")} {company === 'CN' ? t("chińskiej") : t("polskiej")} — {t("wgraj go w zakładce Transakcje poniżej.")}
        </div>
      )}
      <div style={{ padding: '12px 20px 20px', maxWidth: 1400, margin: '0 auto' }}>
        {!isCN && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 9, marginBottom: 11 }}>
              {stanKont.filter(s => s.cur !== 'EUR').map((s, i) => {
                const val = s.vals[qi] || 0
                return (
                  <div key={i} style={{ background: i === 0 ? C.navy : C.navy2, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
                    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{t(s.label)}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 21, fontWeight: 700, color: val < 0 ? '#FCA5A5' : '#fff' }}>
                      {fmt(val)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{s.cur}</span>
                    </div>
                    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.32)', marginTop: 2 }}>{t("na koniec")} {Q_LABELS[qi]}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 9, marginBottom: 11 }}>
              {[
                { l: 'Marża operacyjna', v: getKK('MARŻA OPERACYJNA', selQ), fmt: true, bl: getKK('MARŻA OPERACYJNA', selQ) >= 0 ? C.green : C.red },
                { l: 'Przychód netto', v: getKK('Przychód netto (po VAT)', selQ), fmt: true, bl: C.blue },
                { l: 'Podatki', v: getKK('Podatki (CIT/VAT/ZUS)', selQ), fmt: true, bl: C.purple },
                { l: 'Nierozliczonych', v: getKK('Nierozliczonych', selQ), fmt: false, bl: getKK('Nierozliczonych', selQ) > 0 ? C.orange : C.green, delta: `Rozliczonych: ${getKK('Rozliczonych całkowicie', selQ)}` },
              ].map((k, i) => (
                <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', borderLeft: `3px solid ${k.bl}` }}>
                  <div style={{ fontSize: 9.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t(k.l)} — {Q_LABELS[qi]}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: k.bl }}>{k.fmt ? ((k.v > 0 ? '+' : '') + fmt(k.v, 0) + ' PLN') : k.v}</div>
                  {k.delta && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{t(k.delta)}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 11, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 22 }}>{isCN ? '🇨🇳' : '🇵🇱'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t("Ostatni wgrany wyciąg")} ({company})</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              {lastUploadForCompany
                ? `${lastUploadForCompany.file_name} · ${new Date(lastUploadForCompany.uploaded_at).toLocaleDateString('pl-PL')} · ${lastUploadForCompany.parsed_count} ${t("transakcji")}`
                : t("Jeszcze żaden wyciąg nie został wgrany dla tej spółki.")}
            </div>
          </div>
          {isCN && (
            <div style={{ fontSize: 10.5, color: C.muted, maxWidth: 260, textAlign: 'right' }}>
              {t("Pełne zestawienia (Kontrola kasy, VAT, Marża) pojawią się tutaj po ustaleniu statusu podatnika VAT chińskiej spółki — na razie dostępna jest zakładka Transakcje.")}
            </div>
          )}
        </div>

        <StatementUploadTile company={company} onUploaded={loadData} />

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 16px', overflowX: 'auto' }}>
            {TABS.map(row => (
              <div key={row.k} onClick={() => setTab(row.k)} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `2px solid ${tab === row.k ? C.blue : 'transparent'}`, marginBottom: -1, color: tab === row.k ? C.blue : row.danger ? C.red : C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                {t(row.l)}
                {row.badge ? <span style={{ background: C.red, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{row.badge}</span> : null}
              </div>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            {tab === 'transakcje' && (
              <TabTransakcje txs={companyTxs} clients={clients} projects={projects} onSave={handleSave}
                {...(isCN ? { internalCategories: CN_INTERNAL_CATEGORIES, editCategories: CN_CATEGORIES, vatRateOptions: [0, 3, 6, 9, 13] } : {})} />
            )}
            {tab === 'kontrola' && (isCN ? <ComingSoonCN label={t("Kontrola kasy")} /> : <TabKontrolaKasy kk={kk} stanKont={stanKont} />)}
            {tab === 'vat' && (isCN ? <ComingSoonCN label={t("VAT & JPK")} /> : <TabVAT vatSummary={vatSummary} podatkiPayments={podatkiPayments} />)}
            {tab === 'marza' && (isCN ? <ComingSoonCN label={t("Marża per klient")} /> : <TabMarza marzaK={marzaK} marzaZ={marzaZ} goClient={goClient} />)}
            {tab === 'cykliczne' && (isCN ? <ComingSoonCN label={t("Płatności cykliczne")} /> : <TabCykliczne items={recurring} />)}
            {tab === 'prognoza' && (isCN ? <ComingSoonCN label={t("Prognoza 30 dni")} /> : <TabPrognoza items={recurring} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
