import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { nextInvoiceNumber, computeTotals } from './utils'
import { nextDocNumber } from '../magazyn/utils'
import { generateInvoicePdf, generateCommercialInvoicePdf } from './pdf'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }
const label = { display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }
const input = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, boxSizing: 'border-box' }

const emptyItem = () => ({ product_id: '', description: '', name_cn: '', name_en: '', quantity: 1, unit: 'szt.', unit_price_net: 0, vat_rate: '23%' })

export default function TabNowaFaktura({ clients, projects, products, company, cnCompany, companyFlag = 'PL', onCreated }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()
  const fieldWrap = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }
  const isCN = companyFlag !== 'PL'
  const isShared = companyFlag === 'SHARED'

  const [typ, setTyp] = useState('sprzedaży')
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [projectId, setProjectId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
  const [currency, setCurrency] = useState('PLN')
  const [paymentMethod, setPaymentMethod] = useState('Przelew')
  const [items, setItems] = useState([emptyItem()])
  const [saving, setSaving] = useState(false)

  // pola specyficzne dla faktury chińskiej / wspólnej ("COMMERCIAL INVOICE")
  const [contractNo, setContractNo] = useState('')
  const [termOfTrade, setTermOfTrade] = useState('FCA Chengdu')
  const [transportMode, setTransportMode] = useState('By Sea')
  const [countryOfOrigin, setCountryOfOrigin] = useState('China')
  const [destinationCountry, setDestinationCountry] = useState('Poland')

  // reset draftu przy zmianie flagi spółki, żeby nie zostawić np. polskiej
  // stawki VAT albo waluty PLN na fakturze oznaczonej jako chińska
  useEffect(() => {
    setCurrency(isCN ? 'CNY' : 'PLN')
    setItems([emptyItem()])
    setProjectId('')
    setClientId(clients[0]?.id || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFlag])

  const clientProjects = useMemo(() => projects.filter(p => p.client_id === clientId), [projects, clientId])
  const totals = useMemo(() => computeTotals(items), [items])
  const totalValue = useMemo(() => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0), 0), [items])

  const handleProductPick = (idx, productId) => {
    const p = products.find(x => x.id === productId)
    setItems(prev => prev.map((it, i) => i === idx ? {
      ...it, product_id: productId,
      description: p ? `${p.code} — ${p.name}` : it.description,
      name_cn: p?.name_cn || it.name_cn,
      name_en: p?.name_en || p?.name || it.name_en,
      unit: p?.unit || it.unit,
      unit_price_net: p ? Number(p.sale_price_net) : it.unit_price_net,
      vat_rate: p?.vat_rate || it.vat_rate,
    } : it))
  }

  const updateItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const stockNote = (it) => {
    const p = products.find(x => x.id === it.product_id)
    if (!p) return null
    if (p.is_service) return { text: t('usługa — bez kontroli stanu'), low: false }
    const low = Number(p.stock) < (Number(it.quantity) || 0)
    return { text: `${low ? '⚠' : '✓'} ${t('dostępne')}: ${p.stock} ${p.unit}`, low }
  }

  const resetForm = () => {
    setItems([emptyItem()]); setProjectId(''); setContractNo('')
  }

  const handleSubmit = async () => {
    if (!isShared && !clientId) { toast.error('Wybierz klienta.'); return }
    const validItems = items.filter(it => it.product_id && Number(it.quantity) > 0)
    if (validItems.length === 0) { toast.error('Dodaj przynajmniej jedną pozycję z magazynu.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const number = await nextInvoiceNumber(supabase, typ, invoiceDate, companyFlag)
    const t2 = computeTotals(validItems)

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      typ, number, client_id: isShared ? null : clientId, project_id: projectId || null,
      invoice_date: invoiceDate, due_date: dueDate, currency, payment_method: paymentMethod,
      subtotal_net: t2.net, vat_total: t2.vat, total_gross: isCN ? totalValue : t2.gross,
      amount: isCN ? totalValue : t2.gross, status: 'nieopłacona', created_by: user?.id,
      company_flag: companyFlag,
      contract_no: isCN ? (contractNo || null) : null,
      term_of_trade: isCN ? termOfTrade : null,
      transport_mode: isCN ? transportMode : null,
      country_of_origin: isCN ? countryOfOrigin : null,
      destination_country: isCN ? destinationCountry : null,
    }).select().single()
    if (invErr) { setSaving(false); toast.error('Nie udało się zapisać faktury: ' + invErr.message); return }

    const itemRows = validItems.map(it => {
      const net = (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0)
      const vat = isCN ? 0 : net * (it.vat_rate === 'zw.' ? 0 : parseFloat(it.vat_rate) / 100 || 0)
      return {
        invoice_id: invoice.id, product_id: it.product_id || null, description: it.description,
        name_cn: it.name_cn || null, name_en: it.name_en || null,
        quantity: it.quantity, unit: it.unit, unit_price_net: it.unit_price_net, vat_rate: isCN ? null : it.vat_rate,
        net_value: net, gross_value: net + vat,
      }
    })
    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsErr) { setSaving(false); toast.error('Faktura zapisana, ale nie udało się zapisać pozycji: ' + itemsErr.message); return }

    // automatyczne WZ dla towarów (nie usług) — z magazynu tej samej spółki (PL/CN)
    for (const it of validItems) {
      const p = products.find(x => x.id === it.product_id)
      if (!p || p.is_service) continue
      const wzNumber = await nextDocNumber(supabase, 'WZ', invoiceDate)
      await supabase.from('warehouse_documents').insert({
        doc_number: wzNumber, doc_type: 'WZ', product_id: p.id, quantity: it.quantity,
        unit_price: p.avg_purchase_price, project_id: projectId || null, invoice_id: invoice.id,
        doc_date: invoiceDate, created_by: user?.id, company: p.company || 'PL',
        note: `Wydanie do faktury ${number}`,
      })
    }

    // PDF — polska faktura VAT albo międzynarodowa Commercial Invoice (CN/SHARED)
    try {
      let blob
      if (isCN) {
        const client = isShared ? null : clients.find(c => c.id === clientId)
        const buyer = isShared
          ? { name: company?.company_name || 'MyChinaPal Sp. z o.o.', nip: company?.company_nip, address: company?.company_address }
          : client
        blob = generateCommercialInvoicePdf({
          invoice: { ...invoice, contract_no: contractNo, term_of_trade: termOfTrade, transport_mode: transportMode, country_of_origin: countryOfOrigin, destination_country: destinationCountry },
          items: itemRows, client: buyer, cnCompany,
        })
      } else {
        const client = clients.find(c => c.id === clientId)
        const { data: contact } = await supabase.from('client_contacts').select('*').eq('client_id', clientId).limit(1).maybeSingle()
        blob = generateInvoicePdf({ invoice: { ...invoice, subtotal_net: t2.net, vat_total: t2.vat, total_gross: t2.gross }, items: itemRows, client, contact, company })
      }
      const path = `${invoice.id}/${number.replace(/\//g, '-')}.pdf`
      const { error: upErr } = await supabase.storage.from('faktury').upload(path, blob, { contentType: 'application/pdf' })
      if (!upErr) await supabase.from('invoices').update({ pdf_path: path }).eq('id', invoice.id)
    } catch (e) {
      console.error('Nie udało się wygenerować PDF:', e)
    }

    setSaving(false)
    resetForm()
    onCreated && onCreated()
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
        {t("Dane faktury")} {isShared ? '🇵🇱⇄🇨🇳' : isCN ? '🇨🇳' : ''}
      </div>
      {isCN && (
        <div style={{ background: C.blight, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: C.text2, marginBottom: 14 }}>
          {isShared
            ? t('Faktura wspólna (intercompany) — sprzedawcą jest chińska spółka, nabywcą MyChinaPal Sp. z o.o. Wygenerujemy międzynarodową Commercial Invoice, tak jak w realnym wzorze.')
            : t('Faktura czysto chińska — sprzedawcą jest chińska spółka, nabywcę wybierasz z listy klientów. Wygenerujemy międzynarodową Commercial Invoice.')}
        </div>
      )}
      <div style={fieldWrap}>
        {!isCN && (
          <div><label style={label}>{t("Typ dokumentu")}</label>
            <select style={input} value={typ} onChange={e => setTyp(e.target.value)}>
              <option value="sprzedaży">{t("Faktura sprzedaży")}</option>
              <option value="zaliczkowa">{t("Faktura zaliczkowa")}</option>
              <option value="pro forma">{t("Faktura pro forma")}</option>
              <option value="korygująca">{t("Faktura korygująca")}</option>
            </select>
          </div>
        )}
        {isShared ? (
          <div><label style={label}>{t("Nabywca")}</label>
            <div style={{ ...input, background: C.bg, color: C.text2 }}>
              {company?.company_name || 'MyChinaPal Sp. z o.o.'} {company?.company_nip ? `· NIP ${company.company_nip}` : ''}
            </div>
          </div>
        ) : (
          <div><label style={label}>{t("Klient")}</label>
            <select style={input} value={clientId} onChange={e => { setClientId(e.target.value); setProjectId('') }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div><label style={label}>{t("Powiązane zamówienie (opcjonalnie)")}</label>
          <select style={input} value={projectId} onChange={e => setProjectId(e.target.value)} disabled={isShared}>
            <option value="">—</option>
            {clientProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
          </select>
        </div>
        <div><label style={label}>{t("Waluta")}</label>
          <select style={input} value={currency} onChange={e => setCurrency(e.target.value)}>
            <option>PLN</option><option>USD</option><option>EUR</option><option>CNY</option>
          </select>
        </div>
        <div><label style={label}>{t("Data wystawienia")}</label><input type="date" style={input} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
        <div><label style={label}>{t("Termin płatności")}</label><input type="date" style={input} value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        {!isCN && (
          <div><label style={label}>{t("Forma płatności")}</label>
            <select style={input} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option>Przelew</option><option>Gotówka</option>
            </select>
          </div>
        )}
        {isCN && (
          <div><label style={label}>{t("Nr kontraktu (opcjonalnie)")}</label><input style={input} value={contractNo} onChange={e => setContractNo(e.target.value)} placeholder="np. CI040725" /></div>
        )}
      </div>

      {isCN && (
        <div style={{ ...fieldWrap, marginTop: -4 }}>
          <div><label style={label}>{t("Warunki dostawy (Term of trade)")}</label><input style={input} value={termOfTrade} onChange={e => setTermOfTrade(e.target.value)} placeholder="FCA Chengdu" /></div>
          <div><label style={label}>{t("Transport")}</label>
            <select style={input} value={transportMode} onChange={e => setTransportMode(e.target.value)}>
              <option>By Sea</option><option>By Railway</option><option>By Air</option><option>By Truck</option>
            </select>
          </div>
          <div><label style={label}>{t("Kraj pochodzenia")}</label><input style={input} value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} /></div>
          <div><label style={label}>{t("Kraj docelowy")}</label><input style={input} value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} /></div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', margin: '6px 0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t("Pozycje")}</span>
        <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 400, textTransform: 'none' }}>{t("towar wybierasz z listy tego co jest już na Magazynie")} {isCN ? '(CN)' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr>
            {(isCN
              ? ['Towar (z magazynu)', '产品中文品名', 'Description (EN)', 'Ilość', 'J.m.', 'Cena jedn. (CNY)', 'Wartość (CNY)', '']
              : ['Towar (z magazynu)', 'Ilość', 'J.m.', 'Cena netto', 'VAT', 'Wartość netto', 'Wartość brutto', '']
            ).map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const net = (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0)
            const vat = net * (it.vat_rate === 'zw.' ? 0 : parseFloat(it.vat_rate) / 100 || 0)
            const note = stockNote(it)
            return (
              <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px', minWidth: 180 }}>
                  <select style={{ ...input, fontSize: 11.5, padding: '5px 7px' }} value={it.product_id} onChange={e => handleProductPick(idx, e.target.value)}>
                    <option value="">—</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                  {note && <div style={{ fontSize: 9.5, color: note.low ? C.red : C.green, marginTop: 3 }}>{note.text}</div>}
                </td>
                {isCN && (
                  <>
                    <td style={{ padding: '6px 8px' }}><input style={{ ...input, fontSize: 11.5, padding: '5px 7px', width: 100 }} value={it.name_cn} onChange={e => updateItem(idx, { name_cn: e.target.value })} placeholder="玻璃杯" /></td>
                    <td style={{ padding: '6px 8px' }}><input style={{ ...input, fontSize: 11.5, padding: '5px 7px', width: 120 }} value={it.name_en} onChange={e => updateItem(idx, { name_en: e.target.value })} placeholder="Glass tumbler" /></td>
                  </>
                )}
                <td style={{ padding: '6px 8px' }}><input style={{ ...input, fontSize: 11.5, padding: '5px 7px', width: 70 }} value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} /></td>
                <td style={{ padding: '6px 8px' }}>{it.unit}</td>
                <td style={{ padding: '6px 8px' }}><input style={{ ...input, fontSize: 11.5, padding: '5px 7px', width: 90 }} value={it.unit_price_net} onChange={e => updateItem(idx, { unit_price_net: e.target.value })} /></td>
                {!isCN && (
                  <td style={{ padding: '6px 8px' }}>
                    <select style={{ ...input, fontSize: 11.5, padding: '5px 7px' }} value={it.vat_rate} onChange={e => updateItem(idx, { vat_rate: e.target.value })}>
                      <option>23%</option><option>8%</option><option>5%</option><option>0%</option><option>zw.</option>
                    </select>
                  </td>
                )}
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{net.toFixed(2)}</td>
                {!isCN && <td style={{ padding: '6px 8px', fontWeight: 700 }}>{(net + vat).toFixed(2)}</td>}
                <td style={{ padding: '6px 8px' }}>{items.length > 1 && <span onClick={() => removeItem(idx)} style={{ cursor: 'pointer', color: C.muted }}>✕</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <span onClick={addItem} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginTop: 8, display: 'inline-block' }}>{t("+ dodaj pozycję z magazynu")}</span>

      <div style={{ background: C.bg, borderRadius: 12, padding: '14px 16px', marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 26 }}>
        {isCN ? (
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Total value")}</div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginTop: 3, color: C.blue }}>{totalValue.toFixed(2)} {currency}</div></div>
        ) : (
          <>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Netto")}</div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginTop: 3 }}>{totals.net.toFixed(2)} {currency}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("VAT")}</div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginTop: 3 }}>{totals.vat.toFixed(2)} {currency}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{t("Brutto")}</div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginTop: 3, color: C.blue }}>{totals.gross.toFixed(2)} {currency}</div></div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={handleSubmit} disabled={saving}
          style={{ border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? .6 : 1 }}>
          {saving ? t("Zapisywanie…") : t("Wystaw i zdejmij z magazynu")}
        </button>
      </div>
      {!isCN && <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Wysyłka do KSeF: skonfiguruj token w zakładce Ustawienia KSeF — wtedy każda wystawiona faktura sprzedaży zostanie automatycznie wysłana.")}</div>}
    </div>
  )
}
