import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { C } from '../lib/theme'
import CountUp from '../components/ui/CountUp'
import TabRejestr from '../components/faktury/TabRejestr'
import TabNowaFaktura from '../components/faktury/TabNowaFaktura'
import TabNaleznosci from '../components/faktury/TabNaleznosci'
import TabVAT from '../components/faktury/TabVAT'
import TabKSeF from '../components/faktury/TabKSeF'
import { paymentStatus } from '../components/faktury/utils'
import { useUI } from '../lib/ui'
import CompanyFlagSwitch from '../components/CompanyFlagSwitch'
import ComingSoonCN from '../components/ComingSoonCN'

const TABS = [
  { key: 'rejestr', label: 'Rejestr faktur', icon: '📋' },
  { key: 'nowa', label: 'Nowa faktura', icon: '🧾' },
  { key: 'naleznosci', label: 'Należności', icon: '⏰' },
  { key: 'vat', label: 'VAT i JPK', icon: '📊' },
  { key: 'ksef', label: 'Ustawienia KSeF', icon: '🔗' },
]

export default function Faktury() {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [products, setProducts] = useState([])
  const [company, setCompany] = useState({})
  const [cnCompany, setCnCompany] = useState(null)
  const [companyFlag, setCompanyFlag] = useState('PL')
  const [tab, setTab] = useState('rejestr')
  const [loading, setLoading] = useState(true)

  const loadInvoices = async () => {
    const { data, error } = await supabase.from('invoices')
      .select('*, clients(name, full_name, nip, address, client_contacts(email)), projects(order_label)')
      .order('invoice_date', { ascending: false })
    if (error) console.error(error)
    setInvoices(data || [])
  }

  const loadCompany = async () => {
    const { data } = await supabase.from('company_settings').select('*')
      .in('key', ['company_name', 'company_nip', 'company_address', 'company_bank_account', 'ksef_token', 'ksef_env', 'ksef_auto_send'])
    setCompany(Object.fromEntries((data || []).map(r => [r.key, r.value])))
  }

  const loadCnCompany = async () => {
    const { data } = await supabase.from('cn_company_settings').select('*').eq('company', 'CN').maybeSingle()
    setCnCompany(data || null)
  }

  const loadAll = async () => {
    setLoading(true)
    const [clRes, prRes, prodRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('projects').select('id,client_id,order_label').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
    ])
    setClients(clRes.data || [])
    setProjects(prRes.data || [])
    setProducts(prodRes.data || [])
    await Promise.all([loadInvoices(), loadCompany(), loadCnCompany()])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const handleRetryKsef = async (invoice) => {
    const { data, error } = await supabase.functions.invoke('ksef-send-invoice', { body: { invoice_id: invoice.id } })
    if (error) { toast.error('Nie udało się wywołać wysyłki do KSeF: ' + error.message); return }
    if (data && !data.ok) toast.error('KSeF zwrócił błąd: ' + data.error)
    await loadInvoices()
  }

  const handleCreated = async () => { await loadInvoices(); setTab('rejestr') }

  // Trójstronny podział: PL = czysto polskie + wspólne (SHARED); CN = czysto
  // chińskie + wspólne (SHARED) — faktura intercompany dotyczy obu stron,
  // więc widoczna jest z obu flag. SHARED samodzielnie pokazuje tylko wspólne.
  const flagInvoices = useMemo(() => invoices.filter(inv => {
    const flag = inv.company_flag || 'PL'
    if (companyFlag === 'SHARED') return flag === 'SHARED'
    if (companyFlag === 'CN') return flag === 'CN' || flag === 'SHARED'
    return flag === 'PL' || flag === 'SHARED'
  }), [invoices, companyFlag])

  const isCN = companyFlag !== 'PL'
  const cnProducts = useMemo(() => products.filter(p => (p.company || 'PL') === 'CN'), [products])
  const plProducts = useMemo(() => products.filter(p => (p.company || 'PL') === 'PL'), [products])

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = flagInvoices.filter(i => {
      const d = new Date(i.invoice_date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && i.typ !== 'pro forma'
    })
    const unpaid = flagInvoices.filter(i => !i.paid_at && i.typ !== 'pro forma')
    const overdue = unpaid.filter(i => paymentStatus(i) === 'po terminie')
    const suma = unpaid.reduce((s, i) => s + Number(i.total_gross || i.amount || 0), 0)
    const sent = thisMonth.filter(i => i.ksef_status === 'sent').length
    return { wystawioneWMiesiacu: thisMonth.length, sumaNaleznosci: suma, przeterminowane: overdue.length, wyslaneKsef: sent, wszystkieWMiesiacu: thisMonth.length }
  }, [flagInvoices])

  return (
    <div>
      <div style={{ padding: '16px 22px', maxWidth: 1360 }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '26px 30px', color: '#fff',
          background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
          backgroundSize: '300% 300%', animation: 'fkGradShift 16s ease infinite',
          boxShadow: '0 14px 36px rgba(10,22,40,.35)', marginBottom: 18,
        }}>
          <style>{`
            @keyframes fkGradShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            @keyframes fkFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(16px,-12px) scale(1.08); } }
            @keyframes fkFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-14px,14px) scale(1.05); } }
          `}</style>
          <div style={{ position: 'absolute', top: -70, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'fkFloat1 10s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -80, left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.3), transparent 70%)', filter: 'blur(12px)', animation: 'fkFloat2 12s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>🧾</div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>{t("Faktury & Księgowość")}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>{t("Rejestr, wystawianie i integracja z Krajowym Systemem e-Faktur (KSeF)")}</div>
            </div>
            <CompanyFlagSwitch value={companyFlag} onChange={setCompanyFlag} variant="3way" />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Wystawione w tym miesiącu")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={stats.wystawioneWMiesiacu} /></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Suma należności")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={Math.round(stats.sumaNaleznosci)} /> {isCN ? 'CNY' : t("PLN")}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Przeterminowane")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={stats.przeterminowane} /></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Wysłane do KSeF")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={stats.wyslaneKsef} /> / <CountUp value={stats.wszystkieWMiesiacu} /></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 6, marginBottom: 18, overflowX: 'auto' }}>
          {TABS.map(({ key, label, icon }) => (
            <div key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: tab === key ? '#fff' : C.muted, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7, background: tab === key ? C.navy : 'transparent' }}>
              <span style={{ fontSize: 14 }}>{icon}</span>{t(label)}
            </div>
          ))}
        </div>

        {tab === 'rejestr' && <TabRejestr invoices={flagInvoices} loading={loading} onChanged={loadInvoices} onRetryKsef={handleRetryKsef} />}
        {tab === 'nowa' && (
          <TabNowaFaktura clients={clients} projects={projects}
            products={isCN ? cnProducts : plProducts}
            company={company} cnCompany={cnCompany} companyFlag={companyFlag}
            onCreated={handleCreated} />
        )}
        {tab === 'naleznosci' && <TabNaleznosci invoices={flagInvoices} currentUserId={profile?.id} onChanged={loadInvoices} />}
        {tab === 'vat' && (isCN
          ? <ComingSoonCN label={t("VAT i JPK")} note={t("Rozliczenia VAT dla chińskiej spółki (i faktur wspólnych) pojawią się po ustaleniu statusu podatnika VAT (mały / ogólny podatnik) — inny system niż polski JPK.")} />
          : <TabVAT invoices={flagInvoices} />)}
        {tab === 'ksef' && (isCN
          ? <ComingSoonCN label={t("Ustawienia KSeF")} note={t("KSeF to polski Krajowy System e-Faktur — nie dotyczy faktur chińskich ani wspólnych. Profil sprzedawcy chińskiej spółki (nazwa, USCI, adres, kontakt) ustawisz wkrótce w osobnej sekcji Ustawień.")} />
          : <TabKSeF invoices={flagInvoices} onCompanySettingsChanged={loadCompany} />)}
      </div>
    </div>
  )
}
