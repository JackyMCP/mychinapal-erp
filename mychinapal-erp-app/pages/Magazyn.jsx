import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { C } from '../lib/theme'
import CountUp from '../components/ui/CountUp'
import TabKartoteka from '../components/magazyn/TabKartoteka'
import TabDokumenty from '../components/magazyn/TabDokumenty'
import TabNowy from '../components/magazyn/TabNowy'
import { monthRange } from '../components/magazyn/utils'

const TABS = [
  { key: 'kartoteka', label: 'Kartoteka towarów', icon: '📋' },
  { key: 'dokumenty', label: 'Dokumenty magazynowe (PZ/WZ)', icon: '🔁' },
  { key: 'nowy', label: 'Nowy towar / przyjęcie', icon: '➕' },
]

export default function Magazyn() {
  const { t } = useLang()
  const [products, setProducts] = useState([])
  const [docs, setDocs] = useState([])
  const [projects, setProjects] = useState([])
  const [tab, setTab] = useState('kartoteka')
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    const [prodRes, docRes, projRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('warehouse_documents').select('*, products(code,name,unit), projects(order_label)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,order_label').order('created_at', { ascending: false }),
    ])
    if (prodRes.error) console.error(prodRes.error)
    if (docRes.error) console.error(docRes.error)
    setProducts(prodRes.data || [])
    setDocs(docRes.data || [])
    setProjects(projRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const stats = useMemo(() => {
    const goods = products.filter(p => !p.is_service)
    const wartosc = goods.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.avg_purchase_price) || 0), 0)
    const nizkiStan = goods.filter(p => p.min_stock != null && Number(p.stock) < Number(p.min_stock)).length
    const { start, end } = monthRange(new Date().toISOString())
    const pzWTymMiesiacu = docs.filter(d => d.doc_type === 'PZ' && d.doc_date >= start && d.doc_date < end).length
    return { wartosc, liczbaIndeksow: products.length, nizkiStan, pzWTymMiesiacu }
  }, [products, docs])

  return (
    <div>
      <div style={{ padding: '16px 22px', maxWidth: 1360 }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '26px 30px', color: '#fff',
          background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
          backgroundSize: '300% 300%', animation: 'mgGradShift 16s ease infinite',
          boxShadow: '0 14px 36px rgba(10,22,40,.35)', marginBottom: 18,
        }}>
          <style>{`
            @keyframes mgGradShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            @keyframes mgFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(16px,-12px) scale(1.08); } }
            @keyframes mgFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-14px,14px) scale(1.05); } }
            @keyframes mgPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(220,38,38,.22); } 50% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } }
          `}</style>
          <div style={{ position: 'absolute', top: -70, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'mgFloat1 10s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -80, left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.3), transparent 70%)', filter: 'blur(12px)', animation: 'mgFloat2 12s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>📦</div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>{t("Magazyn")}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>{t("Kartoteka towarów i dokumenty magazynowe (PZ/WZ) — źródło pozycji do faktur")}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Wartość magazynu")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={Math.round(stats.wartosc)} /> {t("PLN")}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Liczba indeksów")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={stats.liczbaIndeksow} /></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Poniżej minimum")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {stats.nizkiStan > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', display: 'inline-block', animation: 'mgPulse 2s ease-in-out infinite' }} />}
                  {stats.nizkiStan}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 118 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Przyjęcia w tym miesiącu (PZ)")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}><CountUp value={stats.pzWTymMiesiacu} /></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 6, marginBottom: 18, overflowX: 'auto' }}>
          {TABS.map(({ key, label, icon }) => (
            <div key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: tab === key ? '#fff' : C.muted, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7, background: tab === key ? C.navy : 'transparent' }}>
              <span style={{ fontSize: 14 }}>{icon}</span>{t(label)}
              {key === 'kartoteka' && stats.nizkiStan > 0 && <span style={{ background: tab === key ? 'rgba(255,255,255,.2)' : C.rlight, color: tab === key ? '#fff' : C.red, borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{stats.nizkiStan}</span>}
            </div>
          ))}
        </div>

        {tab === 'kartoteka' && <TabKartoteka products={products} loading={loading} onChanged={loadAll} />}
        {tab === 'dokumenty' && <TabDokumenty docs={docs} loading={loading} />}
        {tab === 'nowy' && <TabNowy products={products} projects={projects} onChanged={loadAll} onGoTab={setTab} />}
      </div>
    </div>
  )
}
