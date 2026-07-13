import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { nextDocNumber } from './utils'
import { useUI } from '../../lib/ui'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }
const fieldWrap = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }
const label = { display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }
const input = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, boxSizing: 'border-box' }

export default function TabNowy({ products, projects, onChanged, onGoTab }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('szt.')
  const [isService, setIsService] = useState(false)
  const [vatRate, setVatRate] = useState('23%')
  const [salePrice, setSalePrice] = useState('')
  const [minStock, setMinStock] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)

  const [pzProductId, setPzProductId] = useState('')
  const [pzQty, setPzQty] = useState('')
  const [pzPrice, setPzPrice] = useState('')
  const [pzProjectId, setPzProjectId] = useState('')
  const [pzDate, setPzDate] = useState(new Date().toISOString().slice(0, 10))
  const [savingPz, setSavingPz] = useState(false)

  const goodsOnly = products.filter(p => !p.is_service)

  const handleAddProduct = async () => {
    if (!code.trim() || !name.trim()) { toast.error('Uzupełnij kod i nazwę towaru.'); return }
    setSavingProduct(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('products').insert({
      code: code.trim(), name: name.trim(), unit, is_service: isService, vat_rate: vatRate,
      sale_price_net: Number(salePrice) || 0, min_stock: minStock ? Number(minStock) : null,
      created_by: user?.id,
    })
    setSavingProduct(false)
    if (error) { toast.error('Nie udało się dodać towaru: ' + error.message); return }
    setCode(''); setName(''); setSalePrice(''); setMinStock(''); setIsService(false)
    onChanged && onChanged()
    onGoTab && onGoTab('kartoteka')
  }

  const handleAddPz = async () => {
    if (!pzProductId || !pzQty || Number(pzQty) <= 0) { toast.error('Wybierz towar i podaj ilość większą od zera.'); return }
    setSavingPz(true)
    const { data: { user } } = await supabase.auth.getUser()
    const docNumber = await nextDocNumber(supabase, 'PZ', pzDate)
    const { error } = await supabase.from('warehouse_documents').insert({
      doc_number: docNumber, doc_type: 'PZ', product_id: pzProductId, quantity: Number(pzQty),
      unit_price: pzPrice ? Number(pzPrice) : null, project_id: pzProjectId || null, doc_date: pzDate,
      created_by: user?.id,
    })
    setSavingPz(false)
    if (error) { toast.error('Nie udało się zapisać przyjęcia: ' + error.message); return }
    setPzProductId(''); setPzQty(''); setPzPrice(''); setPzProjectId('')
    onChanged && onChanged()
    onGoTab && onGoTab('dokumenty')
  }

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Nowy towar w kartotece")}</div>
        <div style={fieldWrap}>
          <div><label style={label}>{t("Kod towaru")}</label><input style={input} value={code} onChange={e => setCode(e.target.value)} placeholder={t("np. PWB-30K")} /></div>
          <div><label style={label}>{t("Nazwa")}</label><input style={input} value={name} onChange={e => setName(e.target.value)} placeholder={t("np. Powerbank 30000mAh")} /></div>
          <div><label style={label}>{t("Jednostka miary")}</label>
            <select style={input} value={unit} onChange={e => setUnit(e.target.value)}>
              <option>szt.</option><option>usł.</option><option>kg</option><option>m</option>
            </select>
          </div>
          <div><label style={label}>{t("Stawka VAT")}</label>
            <select style={input} value={vatRate} onChange={e => setVatRate(e.target.value)}>
              <option>23%</option><option>8%</option><option>5%</option><option>0%</option><option>zw.</option>
            </select>
          </div>
          <div><label style={label}>{t("Cena sprzedaży netto")}</label><input style={input} value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="0,00" /></div>
          <div><label style={label}>{t("Minimalny stan (alert)")}</label><input style={input} value={minStock} onChange={e => setMinStock(e.target.value)} placeholder={t("np. 20")} disabled={isService} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={isService} onChange={e => setIsService(e.target.checked)} /> {t("To jest usługa (bez kontroli stanu magazynowego)")}
        </label>
        <button onClick={handleAddProduct} disabled={savingProduct}
          style={{ border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: C.blue, color: '#fff', opacity: savingProduct ? .6 : 1 }}>
          {savingProduct ? t("Zapisywanie…") : t("Dodaj towar do kartoteki")}
        </button>
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Ręczne przyjęcie (PZ)")}</div>
        <div style={fieldWrap}>
          <div><label style={label}>{t("Towar")}</label>
            <select style={input} value={pzProductId} onChange={e => setPzProductId(e.target.value)}>
              <option value="">—</option>
              {goodsOnly.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div><label style={label}>{t("Ilość")}</label><input style={input} value={pzQty} onChange={e => setPzQty(e.target.value)} placeholder={t("np. 200")} /></div>
          <div><label style={label}>{t("Cena zakupu (netto, jednostkowa)")}</label><input style={input} value={pzPrice} onChange={e => setPzPrice(e.target.value)} placeholder="0,00" /></div>
          <div><label style={label}>{t("Data przyjęcia")}</label><input type="date" style={input} value={pzDate} onChange={e => setPzDate(e.target.value)} /></div>
          <div><label style={label}>{t("Powiązane zamówienie (opcjonalnie)")}</label>
            <select style={input} value={pzProjectId} onChange={e => setPzProjectId(e.target.value)}>
              <option value="">—</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleAddPz} disabled={savingPz}
          style={{ border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: C.blue, color: '#fff', opacity: savingPz ? .6 : 1 }}>
          {savingPz ? t("Zapisywanie…") : t("Zatwierdź przyjęcie (PZ)")}
        </button>
      </div>
    </div>
  )
}
