import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { C, fmt } from '../lib/theme'
import { useUI } from '../lib/ui'
import useIsMobile from '../lib/useIsMobile'
import { computeQuoteTotals, STATUS_LABELS } from '../components/wyceny/calc'
import QuoteEditor from '../components/wyceny/QuoteEditor'
import NewProjectModal from '../components/projekty/NewProjectModal'
import { createQuoteFromExcelFile, isExcelFile } from '../lib/quoteIntake'

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
  const [pickFile, setPickFile] = useState(null)
  const [search, setSearch] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Pozwala przejść jednym kliknięciem wprost do konkretnej wyceny z
  // zewnątrz (np. z zadania w Centrum zadań — "Dodaj marżę i wyślij wycenę
  // ..." — patrz lib/taskLinks.js) przez link /wyceny?quote=<id>, zamiast
  // zmuszać do szukania jej ręcznie na liście.
  useEffect(() => {
    const wanted = searchParams.get('quote')
    if (wanted) setOpenId(wanted)
  }, [searchParams])

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

  // Od tej wersji wycena NIE jest już tworzona ręcznie — zespół CN dostarcza
  // gotowy plik Excel (tutaj, albo w panelu zamówienia, albo na czacie
  // zamówienia z przypisaniem kategorii "Wycena" — wszystkie trzy sposoby
  // wywołują tę samą funkcję i dają identyczny efekt). Aplikacja parsuje
  // plik, tworzy wycenę + pozycje + zdjęcia i powiadamia cały zespół PL.
  const handleCreate = async () => {
    if (!pickClient || !pickProject) { toast.error(t('Wybierz klienta i zamówienie.')); return }
    if (!pickFile) { toast.error(t('Wybierz plik Excel z wyceną od zespołu CN.')); return }
    if (!isExcelFile(pickFile)) { toast.error(t('To musi być plik Excel (.xlsx / .xls).')); return }
    setCreating(true)
    const project = projects.find(p => p.id === pickProject)
    const client = clients.find(c => c.id === pickClient)
    const result = await createQuoteFromExcelFile(pickFile, project, client, quotes.map(q => q.quote_number))
    setCreating(false)
    if (!result.ok) { toast.error(t('Nie udało się przyjąć wyceny: ') + result.error); return }
    setPicking(false); setPickClient(''); setPickProject(''); setPickFile(null)
    await loadAll()
    setOpenId(result.quoteId)
    const notifyMsg = result.notifyFailed
      ? t(` (⚠ nie udało się powiadomić części zespołu PL)`)
      : t(` — zespół PL (${result.notified}) dostał powiadomienie`)
    const actionMsg = result.overwritten ? t('Wycena nadpisana nowymi danymi ✓') : t('Wycena przyjęta ✓')
    toast.success(t(`${actionMsg} ${result.itemCount} pozycji`) + notifyMsg)
    if (result.uploadFailCount) toast.error(t(`Nie udało się wgrać ${result.uploadFailCount} zdjęć z Excela.`))
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
    return <QuoteEditor quoteId={openId} onBack={() => { setOpenId(null); setSearchParams({}); loadAll() }} onChanged={loadAll} />
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
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{t("Wyceny od zespołu CN — dolicz koszty i marżę, wyślij do klienta")}</div>
          </div>
          <button onClick={() => setPicking(true)} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', boxShadow: '0 6px 18px rgba(37,99,235,.4)' }}>
            {t("+ Wgraj wycenę")}
          </button>
        </div>
      </div>

      {picking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPicking(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 24, width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("Wgraj wycenę od zespołu CN")}</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14 }}>{t("Wybierz plik Excel z wyceną — aplikacja rozpozna pozycje, zdjęcia i ceny, i powiadomi cały zespół PL przypisany do zamówienia.")}</div>
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

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>{t("Plik Excel z wyceną od zespołu CN")}</label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, border: `1.5px dashed ${pickFile ? C.blue : C.border}`,
              background: pickFile ? C.blight : C.bg, borderRadius: 9, padding: '12px 13px', cursor: 'pointer', marginBottom: 16,
            }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: pickFile ? C.blue : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pickFile ? pickFile.name : t("Wybierz plik .xlsx / .xls…")}
                </span>
                <span style={{ display: 'block', fontSize: 9.5, color: C.muted, marginTop: 1 }}>
                  {t("Pozycje, ceny i zdjęcia zostaną rozpoznane automatycznie")}
                </span>
              </span>
              <input type="file" accept=".xlsx,.xls,.xlsm" onChange={e => setPickFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setPicking(false); setPickFile(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj")}</button>
              <button onClick={handleCreate} disabled={creating || !pickClient || !pickProject || !pickFile} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (creating || !pickClient || !pickProject || !pickFile) ? .6 : 1 }}>
                {creating ? t("Przetwarzanie…") : t("Przyjmij wycenę")}
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
