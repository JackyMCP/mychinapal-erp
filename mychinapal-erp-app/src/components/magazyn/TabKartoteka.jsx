import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { C } from '../../lib/theme'
import { photoGradient } from './utils'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }
const chip = (active) => ({ padding: '7px 13px', borderRadius: 8, border: `1px solid ${active ? C.navy : C.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? C.navy : '#fff', color: active ? '#fff' : C.text2 })

export default function TabKartoteka({ products, loading, onChanged, currencyLabel = 'PLN' }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const fileRefs = useRef({})

  const filtered = useMemo(() => products.filter(p => {
    if (filter === 'low') { if (p.min_stock == null || Number(p.stock) >= Number(p.min_stock)) return false }
    if (filter === 'service') { if (!p.is_service) return false }
    if (filter === 'import') { if (p.source !== 'import') return false }
    if (search && !(`${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  }), [products, filter, search])

  const handlePhoto = async (product, file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`); return }
    setUploadingId(product.id)
    const path = `${product.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from('produkty').upload(path, file)
    if (upErr) { setUploadingId(null); toast.error('Nie udało się wgrać zdjęcia: ' + upErr.message); return }
    const { error } = await supabase.from('products').update({ photo_path: path }).eq('id', product.id)
    setUploadingId(null)
    if (error) { toast.error('Nie udało się zapisać zdjęcia: ' + error.message); return }
    onChanged && onChanged()
  }

  const photoUrl = (path) => path ? supabase.storage.from('produkty').getPublicUrl(path).data.publicUrl : null

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={chip(filter === 'all')} onClick={() => setFilter('all')}>{t("Wszystkie towary")}</div>
          <div style={chip(filter === 'low')} onClick={() => setFilter('low')}>{t("Niski stan")}</div>
          <div style={chip(filter === 'import')} onClick={() => setFilter('import')}>{t("Z importu (Chiny)")}</div>
          <div style={chip(filter === 'service')} onClick={() => setFilter('service')}>{t("Usługi")}</div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj kodu, nazwy…")}
          style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11.5, maxWidth: 220 }} />
      </div>

      {filtered.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 16, textAlign: 'center' }}>{t("Brak towarów spełniających kryteria.")}</div>}

      {filtered.map(p => {
        const url = photoUrl(p.photo_path)
        const low = p.min_stock != null && Number(p.stock) < Number(p.min_stock)
        return (
          <div key={p.id} className="ux-hover-lift" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 10, background: C.white }}>
            <div style={{
              width: 60, height: 60, borderRadius: 14, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: p.is_service ? 22 : 0, background: url ? `url(${url})` : photoGradient(p.code), backgroundSize: 'cover', backgroundPosition: 'center',
            }}>
              {p.is_service && '🧰'}
              <input ref={el => fileRefs.current[p.id] = el} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhoto(p, e.target.files?.[0])} />
              <span onClick={() => fileRefs.current[p.id]?.click()} title={t("Dodaj / zmień zdjęcie")} style={{
                position: 'absolute', bottom: -5, right: -5, width: 22, height: 22, borderRadius: '50%', background: '#fff', border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer', boxShadow: '0 2px 6px rgba(15,23,42,.15)',
              }}>{uploadingId === p.id ? '…' : '📷'}</span>
            </div>
            <div style={{ width: isMobile ? 130 : 210, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.code} <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, display: 'block', marginTop: 2 }}>{p.name}</span></div>
              {(p.name_cn || p.name_en) && (
                <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{[p.name_cn, p.name_en].filter(Boolean).join(' · ')}</div>
              )}
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: p.is_service ? C.bg : C.blight, color: p.is_service ? C.muted : C.blue, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  {p.is_service ? t('usługa') : (p.source === 'import' ? t('z importu') : t('towar'))}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, textAlign: 'right' }}>
              <div><div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Stan")}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>
                  {p.is_service ? <span style={{ color: C.muted }}>—</span> : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: low ? C.rlight : C.glight, color: low ? C.red : C.green }}>{p.stock} {p.unit}</span>
                  )}
                </div>
              </div>
              <div><div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Śr. cena zakupu")}</div><div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3, color: p.is_service ? C.muted : C.text }}>{p.is_service ? '—' : `${Number(p.avg_purchase_price).toFixed(2)} ${currencyLabel}`}</div></div>
              <div><div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Cena sprzedaży")}</div><div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{Number(p.sale_price_net).toFixed(2)} {currencyLabel}</div></div>
              <div><div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Wartość")}</div><div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3, color: p.is_service ? C.muted : C.text }}>{p.is_service ? '—' : `${Math.round(p.stock * p.avg_purchase_price).toLocaleString('pl-PL')} ${currencyLabel}`}</div></div>
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>{t("Na fakturze w module Faktury & Księgowość można wybrać tylko towary/usługi, które są tutaj — nie da się wpisać ręcznie pozycji spoza kartoteki.")}</div>
    </div>
  )
}
