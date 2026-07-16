import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { photoGradient } from './utils'
import { describeHsCode } from '../wyceny/hsChapters'

// "Baza produktów" — pełna, edytowalna karta każdego towaru (zdjęcia,
// specyfikacja, ceny, dane celne) — w odróżnieniu od "Kartoteka towarów"
// (szybka lista do przeglądania stanów). Karty tworzą się automatycznie z
// wysłanych wycen (patrz lib/productCatalog.js) już z większością danych
// uzupełnioną — tutaj zespół tylko dogląda/poprawia. Każde pole edytowalne
// WPROST na karcie, zapis automatyczny (debounce), bez osobnego "Zapisz".
const MAX_PHOTOS = 6
const UNIT_OPTIONS = ['szt.', 'zestaw', 'kpl.', 'para', 'opak.', 'm²', 'm³', 'kg', 'mb', 'usł.']
const VAT_OPTIONS = ['23%', '8%', '5%', '0%', 'zw.']

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }
const label = { fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em', display: 'block', marginBottom: 4 }
const field = { border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 9px', fontSize: 11.5, width: '100%', outline: 'none', boxSizing: 'border-box' }
const chip = (active) => ({ padding: '7px 13px', borderRadius: 8, border: `1px solid ${active ? C.navy : C.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? C.navy : '#fff', color: active ? '#fff' : C.text2 })

export default function TabBazaProduktow({ products, loading, onChanged, currencyLabel = 'PLN', company = 'PL' }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(products)
  const [busyPhoto, setBusyPhoto] = useState(null)
  const [busyAi, setBusyAi] = useState(null)
  const [creating, setCreating] = useState(false)
  const saveTimers = useRef({})

  // Rodzic (Magazyn.jsx) przeładowuje `products` po każdym udanym zapisie
  // (patrz saveField niżej) — resync lokalnej kopii do świeżych danych. Same
  // wpisywanie (przed zapisem) trzyma się WYŁĄCZNIE w `rows`, więc nadpisanie
  // to nie gubi tego, co ktoś właśnie pisze (rodzic odświeża się dopiero PO
  // zapisaniu tej samej wartości).
  useEffect(() => { setRows(products) }, [products])

  const filtered = useMemo(() => rows.filter(p => {
    if (filter === 'low') { if (p.min_stock == null || Number(p.stock) >= Number(p.min_stock)) return false }
    if (filter === 'service') { if (!p.is_service) return false }
    if (filter === 'import') { if (p.source !== 'import') return false }
    if (filter === 'wycena') { if (p.source !== 'wycena') return false }
    if (search && !(`${p.code} ${p.name} ${p.name_cn || ''} ${p.name_en || ''}`.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  }), [rows, filter, search])

  const patchLocal = (id, patch) => setRows(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))

  // Zapis pojedynczej zmiany do bazy, z debounce 800ms od ostatniej zmiany
  // TEGO SAMEGO pola na TYM SAMYM produkcie — pisanie w polu tekstowym nie
  // wysyła zapytania przy każdym znaku. `patch` może zawierać kilka pól naraz
  // (np. przy zmianie zdjęcia: photo_paths + photo_path).
  const saveField = (id, patch, { immediate = false } = {}) => {
    patchLocal(id, patch)
    const key = id
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    const doSave = async () => {
      // sale_price_net/avg_purchase_price/stock są w bazie NOT NULL — jeśli
      // ktoś chwilowo wyczyścił pole (puste ''), zanim wpisze nową wartość,
      // wysłanie '' wprost do numeric kolumny wywaliłoby błąd zapisu. Lokalny
      // podgląd (rows) może być pusty, ale do bazy leci wtedy bezpieczne 0.
      const NOT_NULL_NUMERIC = ['sale_price_net', 'avg_purchase_price', 'stock']
      const safePatch = { ...patch }
      for (const k of NOT_NULL_NUMERIC) if (safePatch[k] === '') safePatch[k] = 0
      const { error } = await supabase.from('products').update(safePatch).eq('id', id)
      if (error) toast.error(t('Nie udało się zapisać zmiany: ') + error.message)
      onChanged && onChanged()
    }
    if (immediate) doSave()
    else saveTimers.current[key] = setTimeout(doSave, 800)
  }

  const photoUrl = (path) => path ? supabase.storage.from('produkty').getPublicUrl(path).data.publicUrl : null

  const handleAddPhoto = async (product, file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(t(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`)); return }
    const existing = product.photo_paths || []
    if (existing.length >= MAX_PHOTOS) { toast.error(t(`Maksymalnie ${MAX_PHOTOS} zdjęć na produkt.`)); return }
    setBusyPhoto(product.id)
    const path = `${product.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error } = await supabase.storage.from('produkty').upload(path, file)
    if (error) { setBusyPhoto(null); toast.error(t('Nie udało się wgrać zdjęcia: ') + error.message); return }
    const next = [...existing, path]
    saveField(product.id, { photo_paths: next, photo_path: next[0] }, { immediate: true })
    setBusyPhoto(null)
  }

  const removePhoto = (product, path) => {
    const next = (product.photo_paths || []).filter(p => p !== path)
    saveField(product.id, { photo_paths: next, photo_path: next[0] || null }, { immediate: true })
  }

  const handlePastePhoto = (product, e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { e.preventDefault(); handleAddPhoto(product, file) }
        return
      }
    }
  }

  // Sugestia kodu CN/HS + stawki cła (ta sama edge function co w module
  // Wyceny) — zdjęcie bierzemy jako publiczny URL (bucket 'produkty' jest
  // publiczny, więc bez podpisanych linków).
  const handleAiSuggest = async (product) => {
    if (!product.name && !product.photo_paths?.length) { toast.error(t('Dodaj zdjęcie albo wpisz nazwę towaru, żeby AI mogło coś zasugerować.')); return }
    setBusyAi(product.id)
    try {
      const photo_url = product.photo_paths?.[0] ? photoUrl(product.photo_paths[0]) : null
      const { data, error } = await supabase.functions.invoke('suggest-customs-code', {
        body: { name: product.name || '', specification: product.specification || '', photo_url },
      })
      if (error) throw error
      const patch = {}
      if (data?.hs_code) patch.hs_code = data.hs_code
      if (data?.duty_rate_percent !== undefined && data?.duty_rate_percent !== null) patch.duty_rate_percent = data.duty_rate_percent
      if (!product.specification && data?.specification) patch.specification = data.specification
      if (Object.keys(patch).length) {
        saveField(product.id, patch, { immediate: true })
        toast[data?.verified ? 'success' : 'error'](data?.verified
          ? t('Sugestia AI wstawiona i zweryfikowana w ISZTAR — mimo to warto rzucić okiem przed użyciem.')
          : t('Sugestia AI wstawiona, ale kodu NIE udało się potwierdzić w ISZTAR — sprawdź ręcznie.'))
        patchLocal(product.id, { ai_suggestion: data })
      } else {
        toast.error(t('AI nie zwróciło żadnej sugestii.'))
      }
    } catch (e) {
      toast.error(t('Błąd sugestii AI: ') + (e.message || e))
    }
    setBusyAi(null)
  }

  const handleCreateBlank = async () => {
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const code = `NOWY-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const { error } = await supabase.from('products').insert({ code, name: '', unit: 'szt.', company, created_by: user?.id })
    setCreating(false)
    if (error) { toast.error(t('Nie udało się utworzyć karty: ') + error.message); return }
    setFilter('all'); setSearch('')
    onChanged && onChanged()
    toast.success(t('Nowa karta produktu dodana — uzupełnij dane poniżej.'))
  }

  const handleDelete = async (product) => {
    if (!await confirm(t(`Usunąć kartę „${product.name || product.code}” z Bazy produktów? Tej operacji nie można cofnąć.`))) return
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (error) { toast.error(t('Nie udało się usunąć: ') + (error.message?.includes('foreign key') ? t('ten towar jest już użyty w dokumencie magazynowym/fakturze i nie można go usunąć.') : error.message)); return }
    onChanged && onChanged()
    toast.success(t('Usunięto kartę produktu.'))
  }

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={chip(filter === 'all')} onClick={() => setFilter('all')}>{t("Wszystkie")}</div>
          <div style={chip(filter === 'low')} onClick={() => setFilter('low')}>{t("Niski stan")}</div>
          <div style={chip(filter === 'wycena')} onClick={() => setFilter('wycena')}>{t("Z wyceny")}</div>
          <div style={chip(filter === 'import')} onClick={() => setFilter('import')}>{t("Z importu")}</div>
          <div style={chip(filter === 'service')} onClick={() => setFilter('service')}>{t("Usługi")}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj kodu, nazwy…")}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11.5, maxWidth: 220 }} />
          <button onClick={handleCreateBlank} disabled={creating}
            style={{ border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', background: C.blue, color: '#fff', whiteSpace: 'nowrap', opacity: creating ? .6 : 1 }}>
            {creating ? t('Tworzenie…') : t('➕ Nowa karta')}
          </button>
        </div>
      </div>

      {filtered.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 24, textAlign: 'center' }}>{t("Brak produktów spełniających kryteria.")}</div>}

      {filtered.map(p => {
        const photos = p.photo_paths || []
        const low = p.min_stock != null && Number(p.stock) < Number(p.min_stock)
        return (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 190, flexShrink: 0 }}>
                <label style={label}>{t(`Zdjęcia (do ${MAX_PHOTOS}, pierwsze = okładka)`)}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {photos.length > 0 ? photos.map((path, pi) => (
                    <div key={path} style={{ width: pi === 0 ? 100 : 42, height: pi === 0 ? 100 : 42, borderRadius: 10, overflow: 'hidden', position: 'relative', border: `1px solid ${C.border}`, background: C.white }}>
                      <img src={photoUrl(path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {pi === 0 && <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 8, fontWeight: 700, background: 'rgba(10,22,40,.75)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>{t("okładka")}</span>}
                      <span onClick={() => removePhoto(p, path)} title={t('Usuń zdjęcie')}
                        style={{ position: 'absolute', top: 2, right: 2, width: 15, height: 15, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}>✕</span>
                    </div>
                  )) : (
                    <div style={{ width: 100, height: 100, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff', background: photoGradient(p.code) }}>
                      {p.is_service ? '🧰' : '📦'}
                    </div>
                  )}
                  {photos.length < MAX_PHOTOS && (
                    <div
                      tabIndex={0}
                      onPaste={e => handlePastePhoto(p, e)}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleAddPhoto(p, f) }}
                      onDragOver={e => e.preventDefault()}
                      style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px dashed ${C.border}`, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}
                    >
                      <span style={{ fontSize: 18, color: C.muted }}>{busyPhoto === p.id ? '…' : '➕'}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 10, color: C.blue, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                    {t("📁 wybierz plik")}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAddPhoto(p, e.target.files?.[0])} />
                  </label>
                  <span style={{ fontSize: 9, color: C.muted }}>{t("lub +, wklej Ctrl+V")}</span>
                </div>
              </div>

              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={label}>{t("Nazwa towaru")}</label>
                <textarea rows={2} style={{ ...field, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, minHeight: 58, fontWeight: 700 }}
                  value={p.name} onChange={e => saveField(p.id, { name: e.target.value })} placeholder={t("np. Powerbank 30000mAh")} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div><label style={label}>{t("Nazwa chińska")}</label><input style={field} value={p.name_cn || ''} onChange={e => saveField(p.id, { name_cn: e.target.value })} placeholder="例如 移动电源" /></div>
                  <div><label style={label}>{t("Nazwa angielska")}</label><input style={field} value={p.name_en || ''} onChange={e => saveField(p.id, { name_en: e.target.value })} placeholder="e.g. Power bank" /></div>
                </div>
              </div>

              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={label}>{t("Specyfikacja / opis")}</label>
                <textarea rows={4} style={{ ...field, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, minHeight: 96 }}
                  value={p.specification || ''} onChange={e => saveField(p.id, { specification: e.target.value })} placeholder={t("wymiary, materiał, uwagi…")} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 8, marginTop: 12 }}>
              <div><label style={label}>{t("Kod towaru")}</label><input style={field} value={p.code} onChange={e => saveField(p.id, { code: e.target.value })} /></div>
              <div>
                <label style={label}>{t("Jednostka")}</label>
                <select style={field} value={UNIT_OPTIONS.includes(p.unit) ? p.unit : '__custom'}
                  onChange={e => saveField(p.id, { unit: e.target.value === '__custom' ? '' : e.target.value }, { immediate: true })}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  <option value="__custom">{t('Inne…')}</option>
                </select>
                {!UNIT_OPTIONS.includes(p.unit) && (
                  <input style={{ ...field, marginTop: 4 }} value={p.unit} onChange={e => saveField(p.id, { unit: e.target.value })} placeholder={t('wpisz jednostkę')} />
                )}
              </div>
              <div><label style={label}>{t("Stawka VAT")}</label>
                <select style={field} value={p.vat_rate} onChange={e => saveField(p.id, { vat_rate: e.target.value }, { immediate: true })}>
                  {VAT_OPTIONS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div><label style={label}>{t("Cena sprzedaży netto")}</label><input type="text" inputMode="decimal" style={field} value={p.sale_price_net} onChange={e => saveField(p.id, { sale_price_net: e.target.value })} /></div>
              <div><label style={label}>{t("Śr. cena zakupu")}</label><input type="text" inputMode="decimal" style={field} value={p.avg_purchase_price} onChange={e => saveField(p.id, { avg_purchase_price: e.target.value })} /></div>
              <div><label style={label}>{t("Stan magazynowy")}</label><input type="text" inputMode="decimal" style={field} disabled={p.is_service} value={p.is_service ? '' : p.stock} onChange={e => saveField(p.id, { stock: e.target.value })} /></div>
              <div><label style={label}>{t("Min. stan (alert)")}</label><input type="text" inputMode="decimal" style={field} disabled={p.is_service} value={p.min_stock ?? ''} onChange={e => saveField(p.id, { min_stock: e.target.value === '' ? null : e.target.value })} /></div>
              <div><label style={label}>{t("Waga (kg)")}</label><input type="text" inputMode="decimal" style={field} value={p.weight_kg ?? ''} onChange={e => saveField(p.id, { weight_kg: e.target.value === '' ? null : e.target.value })} /></div>
              <div><label style={label}>{t("CBM (m³)")}</label><input type="text" inputMode="decimal" style={field} value={p.cbm ?? ''} onChange={e => saveField(p.id, { cbm: e.target.value === '' ? null : e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!p.is_service} onChange={e => saveField(p.id, { is_service: e.target.checked }, { immediate: true })} /> {t("To usługa")}
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: 8, marginTop: 10, alignItems: 'end' }}>
              <div><label style={label}>{t("Kod CN/HS (10 cyfr)")}</label><input style={field} value={p.hs_code || ''} onChange={e => saveField(p.id, { hs_code: e.target.value })} /></div>
              <div><label style={label}>{t("Stawka cła (%)")}</label><input type="text" inputMode="decimal" style={field} value={p.duty_rate_percent ?? ''} onChange={e => saveField(p.id, { duty_rate_percent: e.target.value === '' ? null : e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleAiSuggest(p)} disabled={busyAi === p.id}
                  style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: busyAi === p.id ? .6 : 1 }}>
                  {busyAi === p.id ? t('Sprawdzam…') : t('🤖 Sugeruj AI')}
                </button>
                {p.hs_code && (
                  <a href={`https://ext-isztar4.mf.gov.pl/taryfa_celna/Search?lang=PL&q=${encodeURIComponent(p.hs_code)}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: C.blue, textDecoration: 'underline', whiteSpace: 'nowrap', alignSelf: 'center' }}>{t("Zweryfikuj w ISZTAR ↗")}</a>
                )}
              </div>
            </div>
            {p.hs_code && describeHsCode(p.hs_code) && (
              <div style={{ fontSize: 9.5, color: C.muted, marginTop: 5 }}>
                {t("Dział")} {String(p.hs_code).replace(/\D/g, '').slice(0, 2)}: <strong>{t(describeHsCode(p.hs_code))}</strong> {t("(orientacyjnie — zawsze zweryfikuj dokładny kod w ISZTAR)")}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: p.is_service ? C.bg : C.blight, color: p.is_service ? C.muted : C.blue, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  {p.is_service ? t('usługa') : (p.source === 'wycena' ? t('z wyceny') : p.source === 'import' ? t('z importu') : t('towar'))}
                </span>
                {low && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: C.rlight, color: C.red }}>{t('niski stan')}</span>}
                {!p.is_service && <span style={{ fontSize: 10, color: C.muted }}>{t("Wartość:")} {Math.round((Number(p.stock) || 0) * (Number(p.avg_purchase_price) || 0)).toLocaleString('pl-PL')} {currencyLabel}</span>}
              </div>
              <button onClick={() => handleDelete(p)} style={{ border: 'none', background: 'none', color: C.red, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{t("🗑 Usuń kartę")}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
