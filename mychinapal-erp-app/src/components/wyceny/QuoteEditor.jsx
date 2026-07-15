import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { computeQuoteTotals, STATUS_LABELS } from './calc'
import { generateQuotePdf } from './pdf'
import { parseQuoteExcel } from './excelImport'

const blankItem = () => ({
  _key: crypto.randomUUID(), id: null,
  name: '', specification: '', qty: 1, unit: 'set', unit_price_cny: 0,
  cbm: '', container_note: '', production_days: '',
  hs_code: '', duty_rate_percent: '', photo_path: null, ai_suggestion: null,
})

const field = { border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 9px', fontSize: 11.5, width: '100%', outline: 'none', boxSizing: 'border-box' }
const label = { fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em', display: 'block', marginBottom: 4 }

export default function QuoteEditor({ quoteId, onBack, onChanged }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()

  const [quote, setQuote] = useState(null)
  const [client, setClient] = useState(null)
  const [contact, setContact] = useState(null)
  const [project, setProject] = useState(null)
  const [company, setCompany] = useState({})
  const [items, setItems] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyPhoto, setBusyPhoto] = useState(null)
  const [busyAi, setBusyAi] = useState(null)
  const [sending, setSending] = useState(false)
  const [photoUrls, setPhotoUrls] = useState({})

  const load = async () => {
    setLoading(true)
    const { data: q, error } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
    if (error || !q) { toast.error(t('Nie udało się wczytać wyceny.')); setLoading(false); return }
    setQuote(q)
    const [cRes, pRes, iRes, ccRes, csRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', q.client_id).single(),
      supabase.from('projects').select('*').eq('id', q.project_id).single(),
      supabase.from('quote_items').select('*').eq('quote_id', q.id).order('position'),
      supabase.from('client_contacts').select('*').eq('client_id', q.client_id).limit(1),
      supabase.from('company_settings').select('*').in('key', ['company_name', 'company_nip', 'company_krs', 'company_regon', 'company_address', 'company_bank_account']),
    ])
    setClient(cRes.data || null)
    setProject(pRes.data || null)
    setItems((iRes.data && iRes.data.length ? iRes.data : [blankItem()]).map(it => ({ ...it, _key: it.id || crypto.randomUUID() })))
    setContact((ccRes.data && ccRes.data[0]) || null)
    setCompany(Object.fromEntries((csRes.data || []).map(r => [r.key, r.value])))
    setDeletedIds([])
    setLoading(false)
  }
  useEffect(() => { load() }, [quoteId])

  // Bucket 'dokumenty' jest prywatny — do podglądu miniatur w edytorze
  // potrzebujemy podpisanych URL-i (nie da się użyć publicznego linku).
  useEffect(() => {
    const paths = items.map(it => it.photo_path).filter(Boolean)
    if (!paths.length) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(paths.map(async (p) => {
        const { data } = await supabase.storage.from('dokumenty').createSignedUrl(p, 3600)
        return [p, data?.signedUrl]
      }))
      if (!cancelled) setPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(entries.filter(([, u]) => u)) }))
    })()
    return () => { cancelled = true }
  }, [items.map(it => it.photo_path).join(',')])

  const totalsCalc = useMemo(() => computeQuoteTotals(items, {
    transportCost: quote?.transport_cost || 0, includeDuty: quote?.include_duty ?? true, marginPercent: quote?.margin_percent || 0,
  }), [items, quote?.transport_cost, quote?.include_duty, quote?.margin_percent])

  const setQ = (patch) => setQuote(prev => ({ ...prev, ...patch }))
  const setItem = (key, patch) => setItems(prev => prev.map(it => it._key === key ? { ...it, ...patch } : it))
  const addItem = () => setItems(prev => [...prev, blankItem()])
  const [importing, setImporting] = useState(false)
  const handleImportExcel = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const parsed = await parseQuoteExcel(file)
      if (!parsed.length) { toast.error(t('Nie udało się rozpoznać żadnych pozycji w tym pliku — sprawdź nagłówki kolumn lub wpisz pozycje ręcznie.')); setImporting(false); return }
      const onlyBlank = items.length === 1 && !items[0].name && !items[0].id
      setItems(prev => [...(onlyBlank ? [] : prev), ...parsed.map(p => ({ ...blankItem(), ...p }))])
      toast.success(t(`Zaimportowano ${parsed.length} pozycji — sprawdź i uzupełnij dane (kod celny, zdjęcia itd.) przed zapisaniem.`))
    } catch (e) {
      toast.error(t('Nie udało się odczytać pliku Excel: ') + (e.message || e))
    }
    setImporting(false)
  }
  const removeItem = (key) => {
    const it = items.find(i => i._key === key)
    if (it?.id) setDeletedIds(prev => [...prev, it.id])
    setItems(prev => prev.filter(i => i._key !== key))
  }

  const handlePhoto = async (key, file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(t(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`)); return }
    setBusyPhoto(key)
    const path = `${quote.client_id}/wyceny/${quoteId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error } = await supabase.storage.from('dokumenty').upload(path, file)
    setBusyPhoto(null)
    if (error) { toast.error(t('Nie udało się wgrać zdjęcia: ') + error.message); return }
    setItem(key, { photo_path: path })
  }

  const photoUrl = (path) => path ? photoUrls[path] : null

  const handleAiSuggest = async (key) => {
    const it = items.find(i => i._key === key)
    if (!it?.name) { toast.error(t('Wpisz najpierw nazwę towaru.')); return }
    setBusyAi(key)
    try {
      const { data, error } = await supabase.functions.invoke('suggest-customs-code', {
        body: { name: it.name, specification: it.specification, photo_url: photoUrl(it.photo_path) },
      })
      if (error) throw error
      if (data?.hs_code) {
        setItem(key, { hs_code: data.hs_code, duty_rate_percent: data.duty_rate_percent ?? it.duty_rate_percent, ai_suggestion: data })
        toast.success(t('Sugestia AI wstawiona — sprawdź i potwierdź w ISZTAR przed wysyłką.'))
      } else {
        toast.error(t('AI nie zwróciło sugestii — wpisz kod ręcznie.'))
      }
    } catch (e) {
      toast.error(t('Funkcja sugestii AI nie jest jeszcze wdrożona (wymaga edge function „suggest-customs-code”) — wpisz kod ręcznie na razie.'))
    }
    setBusyAi(null)
  }

  const handleSave = async (silent = false) => {
    setSaving(true)
    const { error: qErr } = await supabase.from('quotes').update({
      transport_cost: quote.transport_cost || 0, include_duty: quote.include_duty ?? true,
      margin_percent: quote.margin_percent, valid_until: quote.valid_until || null,
      notes: quote.notes || null, currency: quote.currency || 'CNY', updated_at: new Date().toISOString(),
    }).eq('id', quoteId)
    if (qErr) { setSaving(false); toast.error(t('Nie udało się zapisać wyceny: ') + qErr.message); return false }

    if (deletedIds.length) {
      await supabase.from('quote_items').delete().in('id', deletedIds)
      setDeletedIds([])
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const payload = {
        quote_id: quoteId, position: i + 1, photo_path: it.photo_path || null,
        name: it.name || null, specification: it.specification || null,
        qty: Number(it.qty) || 0, unit: it.unit || 'set', unit_price_cny: Number(it.unit_price_cny) || 0,
        cbm: it.cbm === '' ? null : Number(it.cbm), container_note: it.container_note || null,
        production_days: it.production_days === '' ? null : Number(it.production_days),
        hs_code: it.hs_code || null, duty_rate_percent: it.duty_rate_percent === '' ? null : Number(it.duty_rate_percent),
        ai_suggestion: it.ai_suggestion || null,
      }
      if (it.id) {
        await supabase.from('quote_items').update(payload).eq('id', it.id)
      } else {
        const { data } = await supabase.from('quote_items').insert(payload).select().single()
        if (data) setItems(prev => prev.map(p => p._key === it._key ? { ...p, id: data.id } : p))
      }
    }
    setSaving(false)
    if (!silent) toast.success(t('Wycena zapisana ✓'))
    return true
  }

  const handleSendToPL = async () => {
    if (!items.some(it => it.name && Number(it.qty) > 0)) { toast.error(t('Dodaj przynajmniej jedną pozycję z nazwą i ilością.')); return }
    const ok = await handleSave(true)
    if (!ok) return
    const { error } = await supabase.from('quotes').update({ status: 'do_marzy_pl' }).eq('id', quoteId)
    if (error) { toast.error(t('Nie udało się przesłać: ') + error.message); return }
    toast.success(t('Przesłano do zespołu PL — teraz można doliczyć transport, cło i marżę.'))
    load(); onChanged && onChanged()
  }

  const handleUnlock = async () => {
    const { error } = await supabase.from('quotes').update({ status: 'do_marzy_pl' }).eq('id', quoteId)
    if (error) { toast.error(t('Nie udało się odblokować: ') + error.message); return }
    load(); onChanged && onChanged()
  }

  const handleSendToClient = async () => {
    if (quote.margin_percent === null || quote.margin_percent === undefined || quote.margin_percent === '') {
      toast.error(t('Wpisz marżę przed wysłaniem do klienta.')); return
    }
    if (!await confirm(t('Wysłać tę wycenę do klienta? Wygeneruje się PDF z ceną końcową (bez rozbicia na marżę) i automatycznie odblokuje 2. etap zamówienia.'))) return
    const ok = await handleSave(true)
    if (!ok) return
    setSending(true)
    try {
      const { rows, totals } = computeQuoteTotals(items, { transportCost: quote.transport_cost || 0, includeDuty: quote.include_duty ?? true, marginPercent: quote.margin_percent || 0 })
      const photoDataUrls = {}
      for (const it of items) {
        if (it.photo_path) {
          try {
            const { data: signed } = await supabase.storage.from('dokumenty').createSignedUrl(it.photo_path, 300)
            if (signed?.signedUrl) {
              const resp = await fetch(signed.signedUrl)
              const blob = await resp.blob()
              photoDataUrls[it._key] = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
            }
          } catch { /* brak zdjęcia w PDF, nie blokujemy wysyłki */ }
        }
      }
      const blob = await generateQuotePdf({ quote, client, contact, company, rows, totals, photoDataUrls })
      const pdfPath = `${quote.client_id}/wyceny/${quoteId}/${quote.quote_number || quoteId}.pdf`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(pdfPath, blob, { upsert: true, contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('documents').insert({
        client_id: quote.client_id, project_id: quote.project_id,
        category: 'Wycena', file_path: pdfPath, file_name: `${quote.quote_number || 'wycena'}.pdf`,
        uploaded_by: user?.id, source: 'manual',
      })
      const { error: sendErr } = await supabase.from('quotes').update({ status: 'wyslana', sent_at: new Date().toISOString(), pdf_path: pdfPath }).eq('id', quoteId)
      if (sendErr) throw sendErr
      toast.success(t('Wycena wysłana ✓ Etap „Wpłata klienta na towar” został odblokowany.'))
      load(); onChanged && onChanged()
    } catch (e) {
      toast.error(t('Nie udało się wysłać wyceny: ') + (e.message || e))
    }
    setSending(false)
  }

  const handleDownloadPdf = async () => {
    if (!quote.pdf_path) { toast.error(t('Brak wygenerowanego PDF.')); return }
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(quote.pdf_path, 300)
    if (error) { toast.error(t('Nie udało się pobrać PDF: ') + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading || !quote) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>{t("Ładowanie…")}</div>

  const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: isMobile ? 14 : 20, marginBottom: 16 }
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }

  return (
    <div style={{ padding: isMobile ? '14px 14px 40px' : '20px 26px 40px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, padding: '7px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("← Wróć do listy")}</button>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>{quote.quote_number}</div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: quote.status === 'wyslana' ? C.glight : quote.status === 'do_marzy_pl' ? C.olight : C.blight, color: quote.status === 'wyslana' ? C.green : quote.status === 'do_marzy_pl' ? C.orange : C.blue }}>
          {t(STATUS_LABELS[quote.status] || quote.status)}
        </span>
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted }}>{client?.name} · {project?.order_label}</div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>📦 {t("Pozycje towaru (zespół chiński — cena fabryczna EXW)")}</div>
        {items.map((it) => (
          <div key={it._key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 74, flexShrink: 0 }}>
                <label style={label}>{t("Zdjęcie")}</label>
                <label style={{ width: 68, height: 68, borderRadius: 8, border: `1.5px dashed ${C.border}`, cursor: 'pointer', overflow: 'hidden', background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {it.photo_path ? <img src={photoUrl(it.photo_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20, color: C.muted }}>{busyPhoto === it._key ? '…' : '📷'}</span>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhoto(it._key, e.target.files?.[0])} />
                </label>
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={label}>{t("Nazwa towaru")}</label>
                <input style={field} value={it.name} onChange={e => setItem(it._key, { name: e.target.value })} placeholder={t("np. QINGSHEF (Duży) 轻奢F（大）")} />
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={label}>{t("Specyfikacja")}</label>
                <input style={field} value={it.specification} onChange={e => setItem(it._key, { specification: e.target.value })} placeholder={t("np. 96m², dwa pokoje, jedna łazienka, taras")} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 8, marginTop: 10 }}>
              <div><label style={label}>{t("Ilość")}</label><input type="number" style={field} value={it.qty} onChange={e => setItem(it._key, { qty: e.target.value })} /></div>
              <div><label style={label}>{t("Jednostka")}</label><input style={field} value={it.unit} onChange={e => setItem(it._key, { unit: e.target.value })} /></div>
              <div><label style={label}>{t("Cena EXW (CNY/szt.)")}</label><input type="number" style={field} value={it.unit_price_cny} onChange={e => setItem(it._key, { unit_price_cny: e.target.value })} /></div>
              <div><label style={label}>{t("CBM (m³)")}</label><input type="number" style={field} value={it.cbm} onChange={e => setItem(it._key, { cbm: e.target.value })} /></div>
              <div><label style={label}>{t("Kontener (opc.)")}</label><input style={field} value={it.container_note} onChange={e => setItem(it._key, { container_note: e.target.value })} placeholder="2*40HQ" /></div>
              <div><label style={label}>{t("Czas produkcji (dni)")}</label><input type="number" style={field} value={it.production_days} onChange={e => setItem(it._key, { production_days: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr auto auto', gap: 8, marginTop: 10, alignItems: 'end' }}>
              <div><label style={label}>{t("Kod CN/HS")}</label><input style={field} value={it.hs_code} onChange={e => setItem(it._key, { hs_code: e.target.value })} placeholder="9406.10" /></div>
              <div><label style={label}>{t("Stawka cła (%)")}</label><input type="number" style={field} value={it.duty_rate_percent} onChange={e => setItem(it._key, { duty_rate_percent: e.target.value })} /></div>
              <button onClick={() => handleAiSuggest(it._key)} disabled={busyAi === it._key}
                style={{ padding: '7px 11px', borderRadius: 7, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {busyAi === it._key ? t('Analizuję…') : t('🤖 Sugeruj AI')}
              </button>
              {it.hs_code && (
                <a href={`https://ext-isztar4.mf.gov.pl/taryfa_celna/Search?lang=PL&q=${encodeURIComponent(it.hs_code)}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: C.blue, textDecoration: 'underline', whiteSpace: 'nowrap' }}>{t("Zweryfikuj w ISZTAR ↗")}</a>
              )}
              <span onClick={() => removeItem(it._key)} style={{ fontSize: 11, color: C.red, cursor: 'pointer', whiteSpace: 'nowrap', justifySelf: 'end' }}>🗑 {t("Usuń pozycję")}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={addItem} style={{ padding: '8px 14px', borderRadius: 8, border: `1px dashed ${C.border}`, background: 'transparent', color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{t("+ Dodaj pozycję")}</button>
          <label style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            {importing ? t('Importowanie…') : t('📥 Importuj z Excela')}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} disabled={importing} onChange={e => handleImportExcel(e.target.files?.[0])} />
          </label>
          <div style={{ fontSize: 9.5, color: C.muted, alignSelf: 'center' }}>{t("Rozpozna kolumny typu Name/Specification/QTY/EXW Unit Price/Volume — resztę uzupełnisz ręcznie.")}</div>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>💰 {t("Transport, cło i marża (zespół polski)")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <div><label style={label}>{t("Szacowany transport (CNY)")}</label><input type="number" style={field} value={quote.transport_cost || ''} onChange={e => setQ({ transport_cost: e.target.value })} /></div>
          <div>
            <label style={label}>{t("Marża (%)")}</label>
            <input type="number" style={field} value={quote.margin_percent ?? ''} onChange={e => setQ({ margin_percent: e.target.value })} placeholder="np. 30" />
          </div>
          <div><label style={label}>{t("Ważna do")}</label><input type="date" style={field} value={quote.valid_until || ''} onChange={e => setQ({ valid_until: e.target.value })} /></div>
          <div><label style={label}>{t("Waluta")}</label>
            <select style={field} value={quote.currency || 'CNY'} onChange={e => setQ({ currency: e.target.value })}>
              <option value="CNY">CNY</option><option value="PLN">PLN</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={quote.include_duty ?? true} onChange={e => setQ({ include_duty: e.target.checked })} />
          {t("Wliczaj cło do kosztu (obliczane od wartości towar + transport, wg stawki każdej pozycji)")}
        </label>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Pozycja', 'Towar', 'Transport (udział)', 'Wart. celna', 'Cło', 'Koszt razem', 'Cena dla klienta'].map(h => (
                  <th key={h} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totalsCalc.rows.map(r => (
                <tr key={r._key}>
                  <td style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.goodsValue, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.transportShare, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.customsValue, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.dutyAmount, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.landedCost, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.blue }}>{fmt(r.finalPrice, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: '8px', textAlign: 'left' }}>{t("Razem")}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.goodsValue, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.transportShare, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.customsValue, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.dutyAmount, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.landedCost, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: C.blue, fontSize: 13 }}>{fmt(totalsCalc.totals.finalPrice, 2)} {quote.currency}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Ten rozkład (marża, cło, koszt towaru osobno) widzi tylko zespół wewnętrzny — na PDF do klienta trafia wyłącznie kolumna „Cena dla klienta”.")}</div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>📄 {t("Objaśnienia na wycenie (widoczne dla klienta)")}</div>
        <textarea value={quote.notes || ''} onChange={e => setQ({ notes: e.target.value })} rows={6}
          style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2, opacity: saving ? .6 : 1 }}>
          {saving ? t("Zapisywanie…") : t("💾 Zapisz")}
        </button>
        {quote.status === 'szkic_cn' && (
          <button onClick={handleSendToPL} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {t("Prześlij do zespołu PL →")}
          </button>
        )}
        {quote.status === 'do_marzy_pl' && (
          <button onClick={handleSendToClient} disabled={sending} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
            {sending ? t("Wysyłanie…") : t("📤 Wyślij do klienta")}
          </button>
        )}
        {quote.status === 'wyslana' && (
          <>
            <button onClick={handleDownloadPdf} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2 }}>{t("Pobierz PDF")}</button>
            <button onClick={handleUnlock} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.orange }}>{t("🔓 Odblokuj do korekty")}</button>
          </>
        )}
      </div>
    </div>
  )
}
