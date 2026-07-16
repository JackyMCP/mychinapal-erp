import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { C, fmt } from '../lib/theme'
import { useUI } from '../lib/ui'
import useIsMobile from '../lib/useIsMobile'
import { computeQuoteTotals, nextQuoteNumber, STATUS_LABELS } from '../components/wyceny/calc'
import QuoteEditor from '../components/wyceny/QuoteEditor'
import NewProjectModal from '../components/projekty/NewProjectModal'

const statusColor = (s) => s === 'wyslana' ? C.green : s === 'do_marzy_pl' ? C.orange : C.blue
const statusBg = (s) => s === 'wyslana' ? C.glight : s === 'do_marzy_pl' ? C.olight : C.blight

export default function Wyceny() {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()
  const [quotes, setQuotes] = useState([])
  const [items, setItems] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pickClient, setPickClient] = useState('')
  const [pickProject, setPickProject] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [startAs, setStartAs] = useState('cn')

  const loadAll = async () => {
    setLoading(true)
    const [qRes, iRes, cRes, pRes] = await Promise.all([
      supabase.from('quotes').select('*, clients(id,name), projects(id,order_label)').order('created_at', { ascending: false }),
      supabase.from('quote_items').select('*'),
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('projects').select('id,client_id,order_label').order('created_at', { ascending: false }),
    ])
    if (qRes.error) console.error(qRes.error)
    setQuotes(qRes.data || [])
    setItems(iRes.data || [])
    setClients(cRes.data || [])
    setProjects(pRes.data || [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  const itemsByQuote = useMemo(() => {
    const m = {}
    for (const it of items) { m[it.quote_id] = m[it.quote_id] || []; m[it.quote_id].push(it) }
    return m
  }, [items])

  const clientProjects = useMemo(() => projects.filter(p => p.client_id === pickClient), [projects, pickClient])
  const pickClientName = useMemo(() => clients.find(c => c.id === pickClient)?.name || '', [clients, pickClient])

  const handleProjectCreated = (project) => {
    setProjects(prev => [project, ...prev])
    setPickProject(project.id)
    setNewProjectOpen(false)
    toast.success(t('Utworzono nowe zamówienie „' + project.order_label + '”.'))
  }

  const filtered = quotes.filter(q => {
    if (!search) return true
    const s = search.toLowerCase()
    return (q.quote_number || '').toLowerCase().includes(s)
      || (q.clients?.name || '').toLowerCase().includes(s)
      || (q.projects?.order_label || '').toLowerCase().includes(s)
  })

  const handleCreate = async () => {
    if (!pickClient || !pickProject) { toast.error(t('Wybierz klienta i zamówienie.')); return }
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const quote_number = nextQuoteNumber(quotes.map(q => q.quote_number))
    const { data, error } = await supabase.from('quotes').insert({
      quote_number, client_id: pickClient, project_id: pickProject,
      status: startAs === 'pl' ? 'do_marzy_pl' : 'szkic_cn',
      // Wyceny zaczynane od razu przez zespół PL są od razu w PLN (waluta
      // rozmowy z polskim klientem); cena bazowa w CNY od zespołu chińskiego
      // pokazuje się wtedy pomocniczo w przeliczniku NBP w edytorze.
      currency: startAs === 'pl' ? 'PLN' : 'CNY',
      created_by: user?.id,
      notes: t('1. Wycena ważna jest 15 dni.\n2. Wycena zawiera: [uzupełnij zakres].\n3. Wycena nie zawiera: transportu, montażu, [uzupełnij].\n4. Czas produkcji: ok. [uzupełnij] dni roboczych.'),
    }).select().single()
    setCreating(false)
    if (error) { toast.error(t('Nie udało się utworzyć wyceny: ') + error.message); return }
    setPicking(false); setPickClient(''); setPickProject(''); setStartAs('cn')
    await loadAll()
    setOpenId(data.id)
  }

  const handleDelete = async (q, e) => {
    e.stopPropagation()
    if (!await confirm(t('Usunąć wycenę „' + q.quote_number + '”? Tej operacji nie da się cofnąć.'))) return
    const { error } = await supabase.from('quotes').delete().eq('id', q.id)
    if (error) { toast.error(t('Nie udało się usunąć: ') + error.message); return }
    await loadAll()
  }

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>{t("Ładowanie wycen…")}</div>

  if (openId) {
    return <QuoteEditor quoteId={openId} onBack={() => { setOpenId(null); loadAll() }} onChanged={loadAll} />
  }

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '20px 26px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <style>{`
        @keyframes wycFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-10px) scale(1.06); } }
        @keyframes wycCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .wyc-card { animation: wycCardIn .25s ease both; transition: transform .15s ease, box-shadow .15s ease; }
        .wyc-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(10,22,40,.1); }
      `}</style>

      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '26px 30px', color: '#fff',
        background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
        backgroundSize: '300% 300%', boxShadow: '0 14px 36px rgba(10,22,40,.35)', marginBottom: 20,
      }}>
        <div style={{ position: 'absolute', top: -70, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'wycFloat1 10s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 50, height: 50, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>📝</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 21, fontWeight: 800 }}>{t("Wyceny")}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{t("Generator wycen dla klientów — od ceny fabrycznej po gotowy PDF")}</div>
          </div>
          <button onClick={() => setPicking(true)} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', boxShadow: '0 6px 18px rgba(37,99,235,.4)' }}>
            {t("+ Nowa wycena")}
          </button>
        </div>
      </div>

      {picking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPicking(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 24, width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("Nowa wycena")}</div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Klient")}</label>
            <select value={pickClient} onChange={e => { setPickClient(e.target.value); setPickProject('') }}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, width: '100%', marginBottom: 12, boxSizing: 'border-box' }}>
              <option value="">{t("— wybierz —")}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Zamówienie")}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={pickProject} onChange={e => setPickProject(e.target.value)} disabled={!pickClient}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}>
                <option value="">{t("— wybierz —")}</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
              </select>
              <button type="button" onClick={() => setNewProjectOpen(true)} disabled={!pickClient} title={t('Nowe zamówienie dla tego klienta')}
                style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 12, fontWeight: 700, cursor: pickClient ? 'pointer' : 'not-allowed', opacity: pickClient ? 1 : .5 }}>
                {t("+ Nowe")}
              </button>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 16 }}>{t("Nie widzisz klienta? Utwórz go najpierw w module Klienci. Zamówienie możesz założyć od razu tutaj przyciskiem „+ Nowe”.")}</div>

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>{t("Kto zaczyna tę wycenę?")}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, border: `1.5px solid ${startAs === 'cn' ? C.blue : C.border}`, background: startAs === 'cn' ? C.blight : C.white, borderRadius: 9, padding: '9px 11px', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700 }}>
                  <input type="radio" name="startAs" checked={startAs === 'cn'} onChange={() => setStartAs('cn')} />
                  {t("Zespół chiński")}
                </span>
                <span style={{ fontSize: 9.5, color: C.muted }}>{t("Szkic bez marży — dopiero potem zespół PL dolicza koszty")}</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, border: `1.5px solid ${startAs === 'pl' ? C.blue : C.border}`, background: startAs === 'pl' ? C.blight : C.white, borderRadius: 9, padding: '9px 11px', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700 }}>
                  <input type="radio" name="startAs" checked={startAs === 'pl'} onChange={() => setStartAs('pl')} />
                  {t("Zespół polski")}
                </span>
                <span style={{ fontSize: 9.5, color: C.muted }}>{t("Mam już Excel/zdjęcia/ceny — pomiń krok chiński, wpisz od razu transport i marżę")}</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setPicking(false); setStartAs('cn') }} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj")}</button>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: creating ? .6 : 1 }}>
                {creating ? t("Tworzenie…") : t("Utwórz wycenę")}
              </button>
            </div>
          </div>
        </div>
      )}

      {newProjectOpen && (
        <NewProjectModal
          clientId={pickClient}
          clientName={pickClientName}
          onClose={() => setNewProjectOpen(false)}
          onCreated={handleProjectCreated}
        />
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("🔍 Szukaj wg numeru, klienta, zamówienia…")}
        style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 13px', fontSize: 12, width: '100%', maxWidth: 360, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted, fontSize: 12, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          {t("Brak wycen — kliknij „+ Nowa wycena”, żeby zacząć.")}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map((q, i) => {
          const qItems = itemsByQuote[q.id] || []
          // Na etapie szkicu CN nie ma jeszcze pobranych kursów NBP — pokazujemy
          // wtedy surową wartość towaru w CNY (cena fabryczna). Po przejściu do
          // zespołu PL / wysłaniu do klienta liczymy już naprawdę w PLN (wg
          // zapisanych na wycenie kursów NBP + prowizji banku).
          const cnyEff = (Number(q.nbp_rate) || 0) * (1 + (Number(q.bank_commission_percent) || 0) / 100)
          const transportEff = (q.transport_currency || 'CNY') === 'PLN'
            ? 1
            : (Number(q.transport_rate) || 0) * (1 + (Number(q.bank_commission_percent) || 0) / 100)
          const { totals } = q.status === 'szkic_cn'
            ? computeQuoteTotals(qItems, {})
            : computeQuoteTotals(qItems, { transportCost: q.transport_cost, includeDuty: q.include_duty, marginPercent: q.margin_percent || 0, cnyRate: cnyEff, transportRate: transportEff })
          return (
            <div key={q.id} className="wyc-card" style={{ animationDelay: `${i * 0.03}s`, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, cursor: 'pointer', position: 'relative' }} onClick={() => setOpenId(q.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700 }}>{q.quote_number}</div>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: statusBg(q.status), color: statusColor(q.status) }}>{t(STATUS_LABELS[q.status] || q.status)}</span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{q.clients?.name || '—'}</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{q.projects?.order_label || '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: C.muted }}>
                <span>{qItems.length} {t("pozycji")}</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: C.text, fontSize: 13 }}>
                  {q.status === 'szkic_cn' ? `${fmt(totals.goodsValue, 0)} CNY` : `${fmt(totals.finalPrice, 0)} PLN`}
                </span>
              </div>
              <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8 }}>{new Date(q.created_at).toLocaleDateString('pl-PL')}</div>
              <span onClick={(e) => handleDelete(q, e)} title={t('Usuń wycenę')}
                style={{
                  position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12.5, color: C.red, background: C.rlight, border: `1px solid ${C.rmid}`,
                }}
                className="wyc-del">🗑</span>
              <style>{`.wyc-del:hover { background: ${C.red} !important; color: #fff !important; }`}</style>
            </div>
          )
        })}
      </div>
    </div>
  )
}
