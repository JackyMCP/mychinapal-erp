import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { computeQuoteTotals, toNum, STATUS_LABELS } from './calc'
import { describeHsCode } from './hsChapters'
import { generateQuotePdf } from './pdf'
import { generateQuotePdfFromLayout } from './pdfFromLayout'
import QuoteLayoutEditor from './QuoteLayoutEditor'
import { parseQuoteExcel } from './excelImport'

const MAX_PHOTOS_PER_ITEM = 6
// Limity dla "Stwórz z plików (AI)" — muszą być spójne z limitami po stronie
// edge function generate-quote-from-files (MAX_FILES / MAX_FILE_BYTES tam),
// żeby użytkownik dostał czytelny komunikat PRZED wysłaniem, a nie dopiero
// z odpowiedzią funkcji.
const MAX_AI_FILES = 12
const MAX_AI_FILE_MB = 8

const blankItem = () => ({
  _key: crypto.randomUUID(), id: null,
  name: '', specification: '', qty: 1, unit: 'szt.', unit_price_cny: 0,
  cbm: '', weight_kg: '', container_note: '', production_days: '',
  hs_code: '', duty_rate_percent: '', photo_paths: [], ai_suggestion: null,
})

const CURRENCIES = ['PLN', 'CNY', 'USD', 'EUR']
const UNIT_OPTIONS = ['szt.', 'zestaw', 'kpl.', 'para', 'opak.', 'm²', 'm³', 'kg', 'mb']

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
  const [aiPrompts, setAiPrompts] = useState({})
  const [busyAiRefine, setBusyAiRefine] = useState(null)
  const [sending, setSending] = useState(false)
  const [photoUrls, setPhotoUrls] = useState({})
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null)
  const [aiFilesOpen, setAiFilesOpen] = useState(false)
  const [aiFilesList, setAiFilesList] = useState([])
  const [aiFilesInstruction, setAiFilesInstruction] = useState('')
  const [aiFilesBusy, setAiFilesBusy] = useState(false)
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  const [layoutPhotoDataUrls, setLayoutPhotoDataUrls] = useState(null)
  const [layoutLoading, setLayoutLoading] = useState(false)

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
      supabase.from('company_settings').select('*').in('key', ['company_name', 'company_nip', 'company_krs', 'company_regon', 'company_address', 'company_bank_account', 'bank_commission_percent']),
    ])
    setClient(cRes.data || null)
    setProject(pRes.data || null)
    setItems((iRes.data && iRes.data.length ? iRes.data : [blankItem()]).map(it => ({
      ...it, _key: it.id || crypto.randomUUID(),
      photo_paths: it.photo_paths && it.photo_paths.length ? it.photo_paths : (it.photo_path ? [it.photo_path] : []),
    })))
    setContact((ccRes.data && ccRes.data[0]) || null)
    const companySettings = Object.fromEntries((csRes.data || []).map(r => [r.key, r.value]))
    setCompany(companySettings)
    // Nowa wycena bez ustawionej jeszcze prowizji -> podpowiedz domyślną z Ustawień KSeF.
    if ((q.bank_commission_percent === null || q.bank_commission_percent === undefined) && companySettings.bank_commission_percent) {
      setQuote(prev => ({ ...prev, bank_commission_percent: Number(companySettings.bank_commission_percent) }))
    }
    setDeletedIds([])
    setLoading(false)
  }
  useEffect(() => { load() }, [quoteId])

  // Bucket 'dokumenty' jest prywatny — do podglądu miniatur w edytorze
  // potrzebujemy podpisanych URL-i (nie da się użyć publicznego linku).
  // Zaraz po wgraniu pliku odczyt czasem chwilę "nie widzi" nowego obiektu
  // (opóźnienie propagacji w Storage) i zwraca "Object not found" — dlatego
  // próbujemy kilka razy z krótkim odstępem, zanim uznamy to za realny błąd.
  const sleep = (ms) => new Promise(res => setTimeout(res, ms))
  const createSignedUrlWithRetry = async (path, attempts = 5, delayMs = 700) => {
    let lastError = null
    for (let i = 0; i < attempts; i++) {
      const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(path, 3600)
      if (data?.signedUrl) return { signedUrl: data.signedUrl, error: null }
      lastError = error
      if (i < attempts - 1) await sleep(delayMs)
    }
    return { signedUrl: null, error: lastError }
  }

  // Wspólny rdzeń wywołania edge function suggest-customs-code (kod CN/HS +
  // stawka cła) — używany zarówno przez ręczny przycisk "Sugeruj AI" na
  // pojedynczej pozycji, jak i przez automatyczną sugestię dla WSZYSTKICH
  // pozycji od razu po imporcie z Excela. Rzuca wyjątkiem przy błędzie —
  // każdy wywołujący sam decyduje jak to zakomunikować (pojedynczy toast vs.
  // zbiorcze podsumowanie po imporcie wielu pozycji).
  const fetchCustomsSuggestion = async (name, specification, photoPath) => {
    let photo_url = null
    if (photoPath) {
      const { signedUrl } = await createSignedUrlWithRetry(photoPath, 4, 600)
      photo_url = signedUrl
    }
    const { data, error } = await supabase.functions.invoke('suggest-customs-code', {
      body: { name: name || '', specification: specification || '', photo_url },
    })
    if (error) throw error
    return data
  }

  useEffect(() => {
    const paths = [...new Set(items.flatMap(it => it.photo_paths || []).filter(Boolean))]
    if (!paths.length) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(paths.map(async (p) => {
        const { signedUrl, error } = await createSignedUrlWithRetry(p)
        if (error) console.error('createSignedUrl błąd dla', p, error)
        return [p, signedUrl, error]
      }))
      if (cancelled) return
      setPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(entries.filter(([, u]) => u).map(([p, u]) => [p, u])) }))
      const firstError = entries.find(([, u, err]) => !u && err)
      if (firstError) toast.error(t('Nie udało się wczytać podglądu zdjęcia (po kilku próbach): ') + (firstError[2]?.message || 'nieznany błąd'))
    })()
    return () => { cancelled = true }
  }, [items.flatMap(it => it.photo_paths || []).join(',')])

  // Cena dla klienta jest zawsze w PLN: towar (zawsze w CNY, cena fabryczna)
  // i transport (w walucie wybranej niżej) są przeliczane osobnymi kursami
  // NBP + prowizja banku. VAT doliczany na końcu (23% — standardowa stawka).
  const cnyRateEff = toNum(quote?.nbp_rate) * (1 + toNum(quote?.bank_commission_percent) / 100)
  const transportRateEff = (quote?.transport_currency || 'CNY') === 'PLN'
    ? 1
    : toNum(quote?.transport_rate) * (1 + toNum(quote?.bank_commission_percent) / 100)
  const VAT_PERCENT = 23

  const totalsCalc = useMemo(() => computeQuoteTotals(items, {
    transportCost: quote?.transport_cost || 0, includeDuty: quote?.include_duty ?? true, marginPercent: quote?.margin_percent || 0,
    cnyRate: cnyRateEff, transportRate: transportRateEff, vatPercent: VAT_PERCENT,
  }), [items, quote?.transport_cost, quote?.include_duty, quote?.margin_percent, cnyRateEff, transportRateEff])

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
      const withPhotos = parsed.filter(p => p._photoDataUrls?.length).length
      // Zdjęcia wyciągnięte z komórek Excela (patrz excelImport.js) trzeba
      // wgrać do Storage tak samo jak każde inne zdjęcie pozycji — łącznie
      // z wpisem w `documents`, wymaganym przez politykę SELECT bucketu
      // (bez tego podgląd zdjęcia zawsze zwracałby "Object not found").
      const { data: { user } } = await supabase.auth.getUser()
      let uploadFailCount = 0
      const readyItems = []
      for (const p of parsed) {
        const dataUrls = p._photoDataUrls || []
        delete p._photoDataUrls
        const photoPaths = []
        for (const dataUrl of dataUrls) {
          try {
            const blob = await (await fetch(dataUrl)).blob()
            if (isFileTooBig(blob)) { uploadFailCount++; continue }
            const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
            const path = `${quote.client_id}/wycena-${quoteId}-${crypto.randomUUID()}-excel-import.${ext}`
            const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, blob, { contentType: blob.type || 'image/jpeg' })
            if (upErr) throw upErr
            await supabase.from('documents').insert({
              client_id: quote.client_id, project_id: quote.project_id,
              category: 'Zdjęcie towaru (wycena)', file_path: path, file_name: `excel-${p.name || 'produkt'}.${ext}`,
              uploaded_by: user?.id, source: 'excel_import',
            })
            photoPaths.push(path)
          } catch { uploadFailCount++ }
        }
        readyItems.push({ ...blankItem(), ...p, photo_paths: photoPaths })
      }

      // Sugerowany kod CN/HS + stawka cła mają być widoczne OD RAZU po
      // imporcie, razem z resztą informacji — nie dopiero po ręcznym
      // kliknięciu "Sugeruj AI" na każdej pozycji z osobna. Odpalamy sugestię
      // dla wszystkich zaimportowanych pozycji naraz (równolegle), zanim
      // w ogóle trafią do stanu formularza. Jeśli Excel już podał realną
      // stawkę cła (kolumna "Cło (%)"), NIE nadpisujemy jej sugestią AI —
      // prawdziwe dane z arkusza mają pierwszeństwo przed zgadywaniem.
      let aiFailCount = 0
      await Promise.all(readyItems.map(async (it) => {
        if (!it.name && !it.photo_paths.length) return
        try {
          const data = await fetchCustomsSuggestion(it.name, it.specification, it.photo_paths[0])
          if (data?.hs_code) it.hs_code = data.hs_code
          const hasRealDuty = it.duty_rate_percent !== '' && it.duty_rate_percent !== null && it.duty_rate_percent !== undefined
          if (!hasRealDuty && data?.duty_rate_percent !== undefined && data?.duty_rate_percent !== null) it.duty_rate_percent = data.duty_rate_percent
          if (!it.name && data?.name) it.name = data.name
          if (!it.specification && data?.specification) it.specification = data.specification
          it.ai_suggestion = data
        } catch { aiFailCount++ }
      }))

      const onlyBlank = items.length === 1 && !items[0].name && !items[0].id
      setItems(prev => [...(onlyBlank ? [] : prev), ...readyItems])
      const photoMsg = withPhotos ? t(` (zdjęcia rozpoznane dla ${withPhotos} z nich)`) : ''
      toast.success(t(`Zaimportowano ${parsed.length} pozycji`) + photoMsg + t(' — sugestie kodu CN/HS i cła uzupełnione automatycznie, sprawdź je (zwłaszcza w ISZTAR) i uzupełnij ceny przed zapisaniem.'))
      if (uploadFailCount) toast.error(t(`Nie udało się wgrać ${uploadFailCount} zdjęć z Excela — dodaj je ręcznie.`))
      if (aiFailCount) toast.error(t(`Nie udało się pobrać sugestii AI dla ${aiFailCount} pozycji — uzupełnij je ręcznie przyciskiem "Sugeruj AI".`))
    } catch (e) {
      toast.error(t('Nie udało się odczytać pliku Excel: ') + (e.message || e))
    }
    setImporting(false)
  }

  // "Stwórz wycenę z plików (AI)" — użytkownik wgrywa dowolny zestaw plików
  // (zdjęcia produktów, PDF ze specyfikacją/zdjęciami, notatki tekstowe) i AI
  // (edge function generate-quote-from-files) wyciąga z nich listę pozycji.
  // Jeśli któryś z wgranych plików to zdjęcie konkretnej pozycji, AI wskazuje
  // to (photo_file_indexes) i to zdjęcie wgrywamy do Storage jako photo_paths
  // tej pozycji — tak samo jak przy imporcie z Excela.
  const uploadAiPhotoBlob = async (blob, fileName, userId) => {
    const ext = (blob.type?.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const path = `${quote.client_id}/wycena-${quoteId}-${crypto.randomUUID()}-ai-import.${ext}`
    const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, blob, { contentType: blob.type || 'image/jpeg' })
    if (upErr) throw upErr
    await supabase.from('documents').insert({
      client_id: quote.client_id, project_id: quote.project_id,
      category: 'Zdjęcie towaru (wycena)', file_path: path, file_name: fileName || 'zdjecie.jpg',
      uploaded_by: userId, source: 'ai_files_import',
    })
    return path
  }

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error(t('Nie udało się odczytać pliku ') + file.name))
    r.readAsDataURL(file)
  })

  const handleAiFilesSelected = (fileList) => {
    const incoming = Array.from(fileList || [])
    setAiFilesList(prev => {
      const combined = [...prev]
      for (const f of incoming) {
        if (combined.length >= MAX_AI_FILES) { toast.error(t(`Maksymalnie ${MAX_AI_FILES} plików naraz.`)); break }
        if (f.size > MAX_AI_FILE_MB * 1024 * 1024) { toast.error(t(`Plik "${f.name}" jest za duży (max ${MAX_AI_FILE_MB}MB).`)); continue }
        combined.push(f)
      }
      return combined
    })
  }
  const removeAiFile = (idx) => setAiFilesList(prev => prev.filter((_, i) => i !== idx))

  const isExcelFile = (f) => /\.(xlsx|xls)$/i.test(f.name || '') ||
    f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f.type === 'application/vnd.ms-excel'

  // Pliki Excel wgrane w "Stwórz z plików (AI)" NIE trafiają do modelu AI jako
  // obrazek/tekst (i tak by ich nie odczytał) — zamiast tego przechodzą przez
  // DOKŁADNIE ten sam, sprawdzony parser co przycisk "Importuj z Excela"
  // (parseQuoteExcel: właściwe nazwy/ilości/ceny/zdjęcia z komórek), żeby
  // wgranie Excela razem z innymi plikami dawało identyczny efekt co osobny
  // import. Pozostałe pliki (zdjęcia, PDF, notatki) idą do edge function AI
  // jak dotychczas. Obie listy pozycji łączą się w jedną wycenę.
  const handleGenerateFromFiles = async () => {
    if (!aiFilesList.length) { toast.error(t('Wgraj przynajmniej jeden plik.')); return }
    setAiFilesBusy(true)
    try {
      const excelFiles = aiFilesList.filter(isExcelFile)
      const otherFiles = aiFilesList.filter(f => !isExcelFile(f))
      const { data: { user } } = await supabase.auth.getUser()
      const readyItems = []
      let photoFailCount = 0
      let excelParsedCount = 0
      let aiParsedCount = 0

      // --- Pliki Excel: ten sam parser i to samo wgrywanie zdjęć co
      // handleImportExcel powyżej. ---
      for (const file of excelFiles) {
        try {
          const parsed = await parseQuoteExcel(file)
          for (const p of parsed) {
            const dataUrls = p._photoDataUrls || []
            delete p._photoDataUrls
            const photoPaths = []
            for (const dataUrl of dataUrls) {
              try {
                const blob = await (await fetch(dataUrl)).blob()
                if (isFileTooBig(blob)) { photoFailCount++; continue }
                const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
                const path = `${quote.client_id}/wycena-${quoteId}-${crypto.randomUUID()}-excel-import.${ext}`
                const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, blob, { contentType: blob.type || 'image/jpeg' })
                if (upErr) throw upErr
                await supabase.from('documents').insert({
                  client_id: quote.client_id, project_id: quote.project_id,
                  category: 'Zdjęcie towaru (wycena)', file_path: path, file_name: `excel-${p.name || 'produkt'}.${ext}`,
                  uploaded_by: user?.id, source: 'excel_import',
                })
                photoPaths.push(path)
              } catch { photoFailCount++ }
            }
            readyItems.push({ ...blankItem(), ...p, photo_paths: photoPaths })
            excelParsedCount++
          }
        } catch (e) {
          toast.error(t(`Nie udało się odczytać pliku Excel "${file.name}": `) + (e.message || e))
        }
      }

      // --- Pozostałe pliki (zdjęcia/PDF/tekst) — jak dotychczas, przez AI. ---
      if (otherFiles.length) {
        const filesPayload = await Promise.all(otherFiles.map(async (f) => ({
          name: f.name, mimeType: f.type || 'application/octet-stream', base64: await fileToBase64(f),
        })))
        const { data, error } = await supabase.functions.invoke('generate-quote-from-files', {
          body: { files: filesPayload, instruction: aiFilesInstruction },
        })
        if (error) throw error
        for (const it of (data?.items || [])) {
          const photoIdxs = Array.isArray(it.photo_file_indexes) ? it.photo_file_indexes : []
          const photoPaths = []
          for (const idx of photoIdxs) {
            const srcFile = otherFiles[idx] // indeksy AI odnoszą się do plików przesłanych DO NIEGO (otherFiles), nie do pełnej listy
            if (!srcFile || !srcFile.type?.startsWith('image/')) continue
            try {
              photoPaths.push(await uploadAiPhotoBlob(srcFile, srcFile.name, user?.id))
            } catch { photoFailCount++ }
          }
          readyItems.push({
            ...blankItem(),
            name: it.name || '', specification: it.specification || '',
            qty: it.qty !== null && it.qty !== undefined && it.qty !== '' ? (toNum(it.qty) || 1) : 1,
            unit: it.unit || 'szt.',
            unit_price_cny: it.unit_price_cny !== null && it.unit_price_cny !== undefined ? toNum(it.unit_price_cny) : 0,
            weight_kg: it.weight_kg !== null && it.weight_kg !== undefined ? it.weight_kg : '',
            cbm: it.cbm !== null && it.cbm !== undefined ? it.cbm : '',
            photo_paths: photoPaths,
          })
          aiParsedCount++
        }
        if (data?.warnings?.length) toast.error(data.warnings.join(' '))
        if (otherFiles.length && data && !data.items?.length) toast.error(t('AI nie rozpoznało żadnych pozycji w przesłanych zdjęciach/PDF-ach.'))
      }

      if (!readyItems.length) { toast.error(t('Nie udało się rozpoznać żadnych pozycji w przesłanych plikach.')); setAiFilesBusy(false); return }

      // Sugestia kodu CN/HS + stawki cła OD RAZU dla wszystkich nowych
      // pozycji naraz (i z Excela, i z AI) — spójnie z importem z Excela.
      let aiFailCount = 0
      await Promise.all(readyItems.map(async (it) => {
        if (!it.name && !it.photo_paths.length) return
        try {
          const sug = await fetchCustomsSuggestion(it.name, it.specification, it.photo_paths[0])
          if (sug?.hs_code) it.hs_code = sug.hs_code
          const hasRealDuty = it.duty_rate_percent !== '' && it.duty_rate_percent !== null && it.duty_rate_percent !== undefined
          if (!hasRealDuty && sug?.duty_rate_percent !== undefined && sug?.duty_rate_percent !== null) it.duty_rate_percent = sug.duty_rate_percent
          if (!it.name && sug?.name) it.name = sug.name
          if (!it.specification && sug?.specification) it.specification = sug.specification
          it.ai_suggestion = sug
        } catch { aiFailCount++ }
      }))

      const onlyBlank = items.length === 1 && !items[0].name && !items[0].id
      setItems(prev => [...(onlyBlank ? [] : prev), ...readyItems])
      setAiFilesOpen(false); setAiFilesList([]); setAiFilesInstruction('')
      const parts = []
      if (excelParsedCount) parts.push(t(`${excelParsedCount} z Excela`))
      if (aiParsedCount) parts.push(t(`${aiParsedCount} z AI`))
      toast.success(t(`Utworzono ${readyItems.length} pozycji`) + (parts.length ? ` (${parts.join(', ')})` : '') + t(' — sugestie CN/HS i cła uzupełnione automatycznie, sprawdź je i uzupełnij ceny.'))
      if (photoFailCount) toast.error(t(`Nie udało się wgrać ${photoFailCount} zdjęć — dodaj je ręcznie.`))
      if (aiFailCount) toast.error(t(`Nie udało się pobrać sugestii AI dla ${aiFailCount} pozycji — uzupełnij je ręcznie przyciskiem "Sugeruj AI".`))
    } catch (e) {
      let detail = e?.message || String(e)
      try {
        if (e?.context && typeof e.context.json === 'function') {
          const body = await e.context.json()
          if (body?.error) detail = body.error
        }
      } catch { /* zostaje e.message */ }
      toast.error(t('Błąd generowania z plików: ') + detail)
    }
    setAiFilesBusy(false)
  }

  const removeItem = (key) => {
    const it = items.find(i => i._key === key)
    if (it?.id) setDeletedIds(prev => [...prev, it.id])
    setItems(prev => prev.filter(i => i._key !== key))
  }

  // Pozycja może mieć teraz WIELE zdjęć (do MAX_PHOTOS_PER_ITEM) — każde
  // dodawane zdjęcie dokłada się do tablicy photo_paths, zamiast nadpisywać
  // pojedyncze photo_path jak wcześniej.
  const handleAddPhoto = async (key, file) => {
    if (!file) return
    if (isFileTooBig(file)) { toast.error(t(`Plik jest za duży (max ${MAX_FILE_SIZE_MB}MB).`)); return }
    const current = items.find(i => i._key === key)
    const existingPaths = current?.photo_paths || []
    if (existingPaths.length >= MAX_PHOTOS_PER_ITEM) { toast.error(t(`Maksymalnie ${MAX_PHOTOS_PER_ITEM} zdjęć na pozycję.`)); return }
    setBusyPhoto(key)
    // Płaska ścieżka client_id/plik — dokładnie ten sam wzorzec co reszta
    // aplikacji (Czat, ProjectFiles, TabCzat...).
    const path = `${quote.client_id}/wycena-${quoteId}-${crypto.randomUUID()}-${safeFileName(file.name)}`
    try {
      const { error } = await supabase.storage.from('dokumenty').upload(path, file)
      if (error) { toast.error(t('Nie udało się wgrać zdjęcia: ') + error.message); return }
      // KLUCZOWE: polityka SELECT na bucket 'dokumenty' wymaga, żeby dla
      // każdego pliku istniał odpowiadający mu wiersz w tabeli `documents`
      // (file_path = ścieżka w Storage) — inaczej odczyt/signed URL zawsze
      // zwraca "Object not found", niezależnie od tego czy plik faktycznie
      // istnieje. Bez tego wpisu podgląd zdjęcia nigdy by nie zadziałał.
      const { data: { user } } = await supabase.auth.getUser()
      const { error: docErr } = await supabase.from('documents').insert({
        client_id: quote.client_id, project_id: quote.project_id,
        category: 'Zdjęcie towaru (wycena)', file_path: path, file_name: file.name || 'zdjecie.jpg',
        uploaded_by: user?.id, source: 'manual',
      })
      if (docErr) { toast.error(t('Zdjęcie wgrane, ale nie udało się go zarejestrować (podgląd może nie działać): ') + docErr.message) }
      setItem(key, { photo_paths: [...existingPaths, path] })
      toast.success(t('Zdjęcie dodane ✓'))
      // Jeśli nazwa towaru jeszcze nie jest wpisana — spróbuj ją zasugerować
      // automatycznie na podstawie pierwszego zdjęcia (AI), zamiast czekać,
      // aż ktoś kliknie "Sugeruj AI" ręcznie.
      if (!current?.name && !existingPaths.length) handleAiSuggest(key, path)
    } catch (e) {
      // Wcześniej wyjątek tutaj (np. błąd sieci) przechodził bez żadnego
      // komunikatu — teraz zawsze pokazujemy coś, żeby nie było ciszy.
      toast.error(t('Nie udało się wgrać zdjęcia (wyjątek): ') + (e?.message || String(e)))
    }
    setBusyPhoto(null)
  }

  const removePhoto = (key, path) => {
    const current = items.find(i => i._key === key)
    setItem(key, { photo_paths: (current?.photo_paths || []).filter(p => p !== path) })
  }

  const photoUrl = (path) => path ? photoUrls[path] : null

  // Wklejanie zrzutu ekranu ze schowka (Ctrl+V / Cmd+V) — alternatywa dla
  // wybierania pliku z dysku, przydatna gdy zdjęcie towaru przyszło na czacie
  // i zostało tylko skopiowane, a nie zapisane jako plik.
  const handlePastePhoto = (key, e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          handleAddPhoto(key, file)
        }
        return
      }
    }
  }

  // Generyczny odczyt kursu średniego NBP dla dowolnej waluty obcej (CNY,
  // USD, EUR — PLN nie wymaga przeliczenia). Używane osobno dla ceny towaru
  // (zawsze CNY) i dla transportu (waluta wybierana przez zespół PL).
  const fetchNbpRate = async (currencyCode) => {
    const resp = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currencyCode.toLowerCase()}/?format=json`)
    if (!resp.ok) throw new Error('NBP API: ' + resp.status)
    const data = await resp.json()
    const rate = data?.rates?.[0]
    if (!rate) throw new Error('Brak danych w odpowiedzi NBP')
    return { mid: rate.mid, effectiveDate: rate.effectiveDate }
  }

  const [fetchingRate, setFetchingRate] = useState(false)
  const handleFetchNbpRate = async () => {
    setFetchingRate(true)
    try {
      const { mid, effectiveDate } = await fetchNbpRate('cny')
      setQ({ nbp_rate: mid, nbp_rate_date: effectiveDate })
      toast.success(t(`Pobrano kurs NBP: 1 CNY = ${mid} PLN (${effectiveDate})`))
    } catch (e) {
      toast.error(t('Nie udało się pobrać kursu z NBP: ') + (e.message || e))
    }
    setFetchingRate(false)
  }

  const [fetchingTransportRate, setFetchingTransportRate] = useState(false)
  // Przyjmuje opcjonalnie jawny kod waluty — potrzebne przy zmianie selecta
  // "Waluta transportu", bo w tym samym ticku `quote.transport_currency` w
  // stanie jest jeszcze STARĄ wartością (setQ jest asynchroniczny), więc
  // czytanie go z `quote` dałoby kurs dla poprzedniej waluty.
  const handleFetchTransportRate = async (currencyOverride = null) => {
    const cur = currencyOverride || quote.transport_currency || 'CNY'
    if (cur === 'PLN') { toast.error(t('Transport w PLN nie wymaga przeliczenia kursu.')); return }
    setFetchingTransportRate(true)
    try {
      const { mid, effectiveDate } = await fetchNbpRate(cur)
      setQ({ transport_rate: mid, transport_rate_date: effectiveDate })
      toast.success(t(`Pobrano kurs NBP: 1 ${cur} = ${mid} PLN (${effectiveDate})`))
    } catch (e) {
      toast.error(t('Nie udało się pobrać kursu z NBP: ') + (e.message || e))
    }
    setFetchingTransportRate(false)
  }

  // KLUCZOWE: przy zmianie waluty transportu trzeba od razu skasować stary
  // kurs (był dla POPRZEDNIEJ waluty!) i pobrać nowy — inaczej cena liczy się
  // dalej po nieaktualnym kursie innej waluty (np. 445 USD × stary kurs CNY
  // ≈ 0,51 = 227 PLN zamiast ≈ 1780 PLN). To był realny, zgłoszony błąd.
  const handleTransportCurrencyChange = (newCurrency) => {
    setQ({ transport_currency: newCurrency, transport_rate: null, transport_rate_date: null })
    if (newCurrency !== 'PLN') handleFetchTransportRate(newCurrency)
  }

  // Automatyczne pobranie kursów NBP przy otwarciu wyceny, jeśli jeszcze nie
  // są ustawione — dzięki temu cena dla klienta liczy się i wyświetla "od
  // razu" (na żywo), bez konieczności ręcznego klikania "Odśwież kurs" przy
  // każdym otwarciu wyceny.
  useEffect(() => {
    if (!quote?.id) return
    if (!quote.nbp_rate) handleFetchNbpRate()
    if ((quote.transport_currency || 'CNY') !== 'PLN' && !quote.transport_rate) handleFetchTransportRate()
  }, [quote?.id])

  const handleAiSuggest = async (key, photoPathOverride = null) => {
    const it = items.find(i => i._key === key)
    const photoPath = photoPathOverride || it?.photo_paths?.[0]
    if (!it?.name && !photoPath) { toast.error(t('Dodaj zdjęcie albo wpisz nazwę towaru, żeby AI mogło coś zasugerować.')); return }
    setBusyAi(key)
    try {
      const data = await fetchCustomsSuggestion(it?.name, it?.specification, photoPath)
      const patch = {}
      if (data?.hs_code) patch.hs_code = data.hs_code
      if (data?.duty_rate_percent !== undefined && data?.duty_rate_percent !== null) patch.duty_rate_percent = data.duty_rate_percent
      if (!it?.name && data?.name) patch.name = data.name
      if (!it?.specification && data?.specification) patch.specification = data.specification
      if (Object.keys(patch).length) {
        setItem(key, { ...patch, ai_suggestion: data })
        toast.success(t('Sugestia AI wstawiona — sprawdź i potwierdź (kod celny w ISZTAR) przed wysyłką.'))
      } else {
        toast.error(t('AI nie zwróciło żadnej sugestii — uzupełnij dane ręcznie.'))
      }
    } catch (e) {
      // Wyciągamy realny komunikat błędu z odpowiedzi edge function (jeśli
      // to FunctionsHttpError z ciałem JSON), zamiast zawsze zakładać, że
      // funkcja po prostu nie jest wdrożona — to mogło zmylić przy diagnozie.
      let detail = e?.message || String(e)
      try {
        if (e?.context && typeof e.context.json === 'function') {
          const body = await e.context.json()
          if (body?.error) detail = body.error
        }
      } catch { /* nie udało się odczytać treści błędu — zostaje e.message */ }
      toast.error(t('Błąd sugestii AI: ') + detail)
    }
    setBusyAi(null)
  }

  // Dowolne polecenie w naturalnym języku ("skróć nazwę", "przetłumacz na
  // angielski", "dodaj wymiary") stosowane do nazwy/specyfikacji pozycji —
  // osobna edge function od sugestii kodu celnego.
  const handleAiRefine = async (key) => {
    const it = items.find(i => i._key === key)
    const instruction = (aiPrompts[key] || '').trim()
    if (!instruction) return
    setBusyAiRefine(key)
    try {
      const { data, error } = await supabase.functions.invoke('refine-quote-item', {
        body: { name: it?.name || '', specification: it?.specification || '', instruction },
      })
      if (error) throw error
      const patch = {}
      if (data?.name !== undefined && data?.name !== null) patch.name = data.name
      if (data?.specification !== undefined && data?.specification !== null) patch.specification = data.specification
      if (Object.keys(patch).length) {
        setItem(key, patch)
        setAiPrompts(prev => ({ ...prev, [key]: '' }))
        toast.success(t('Zastosowano zmianę AI — sprawdź wynik.'))
      } else {
        toast.error(t('AI nie zwróciło zmiany — spróbuj innego polecenia.'))
      }
    } catch (e) {
      let detail = e?.message || String(e)
      try {
        if (e?.context && typeof e.context.json === 'function') {
          const body = await e.context.json()
          if (body?.error) detail = body.error
        }
      } catch { /* zostaje e.message */ }
      toast.error(t('Błąd AI: ') + detail)
    }
    setBusyAiRefine(null)
  }

  const handleSave = async (silent = false) => {
    setSaving(true)
    const { error: qErr } = await supabase.from('quotes').update({
      transport_cost: toNum(quote.transport_cost), include_duty: quote.include_duty ?? true,
      margin_percent: quote.margin_percent === '' || quote.margin_percent === null || quote.margin_percent === undefined ? null : toNum(quote.margin_percent),
      valid_until: quote.valid_until || null,
      notes: quote.notes || null, currency: 'PLN', updated_at: new Date().toISOString(),
      nbp_rate: quote.nbp_rate || null, nbp_rate_date: quote.nbp_rate_date || null,
      bank_commission_percent: quote.bank_commission_percent === '' || quote.bank_commission_percent === null || quote.bank_commission_percent === undefined ? null : toNum(quote.bank_commission_percent),
      transport_currency: quote.transport_currency || 'CNY',
      transport_rate: quote.transport_rate || null, transport_rate_date: quote.transport_rate_date || null,
    }).eq('id', quoteId)
    if (qErr) { setSaving(false); toast.error(t('Nie udało się zapisać wyceny: ') + qErr.message); return false }

    if (deletedIds.length) {
      await supabase.from('quote_items').delete().in('id', deletedIds)
      setDeletedIds([])
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const payload = {
        quote_id: quoteId, position: i + 1, photo_paths: it.photo_paths || [], photo_path: it.photo_paths?.[0] || null,
        name: it.name || null, specification: it.specification || null,
        qty: toNum(it.qty), unit: it.unit || 'set', unit_price_cny: toNum(it.unit_price_cny),
        cbm: it.cbm === '' || it.cbm === null || it.cbm === undefined ? null : toNum(it.cbm),
        weight_kg: it.weight_kg === '' || it.weight_kg === null || it.weight_kg === undefined ? null : toNum(it.weight_kg),
        container_note: it.container_note || null,
        production_days: it.production_days === '' || it.production_days === null || it.production_days === undefined ? null : toNum(it.production_days),
        hs_code: it.hs_code || null, duty_rate_percent: it.duty_rate_percent === '' || it.duty_rate_percent === null || it.duty_rate_percent === undefined ? null : toNum(it.duty_rate_percent),
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
    // Zadanie (widoczne w Dashboard/Moje zadania) dla głównego opiekuna PL
    // tego zamówienia — pełni rolę "powiadomienia", że wycena czeka na
    // doliczenie transportu/marży i wysłanie do klienta. Brak generycznej
    // tabeli powiadomień w aplikacji, więc to jest jedyny sensowny sposób.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: assignment } = await supabase.from('project_assignments')
        .select('user_id').eq('project_id', quote.project_id).eq('role', 'glowny_pl').maybeSingle()
      if (assignment?.user_id) {
        await supabase.from('tasks').insert({
          title: `Dodaj marżę i wyślij wycenę ${quote.quote_number} do klienta`,
          description: `Zespół chiński przekazał wycenę ${quote.quote_number}${client?.name ? ' (' + client.name + ')' : ''} — dodaj transport, marżę i VAT, sprawdź kursy NBP i wyślij do klienta.`,
          project_id: quote.project_id, client_id: quote.client_id,
          assigned_to: assignment.user_id, assigned_by: user?.id,
          due_date: new Date().toISOString().slice(0, 10), status: 'todo', priority: 'pilne',
        })
      }
    } catch { /* brak zadania nie blokuje przekazania wyceny */ }
    toast.success(t('Przesłano do zespołu PL — teraz można doliczyć transport, cło i marżę.'))
    load(); onChanged && onChanged()
  }

  // Buduje mapę _key -> [data:URL, data:URL, ...] zdjęć pozycji (jedno lub
  // więcej), do wstawienia w PDF (jspdf potrzebuje danych obrazka jako
  // base64, nie samego URL-a). Pierwsze zdjęcie = okładka pozycji, kolejne =
  // małe miniatury obok.
  const buildPhotoDataUrls = async () => {
    const photoDataUrls = {}
    const failedItems = []
    for (const it of items) {
      const paths = it.photo_paths || []
      if (!paths.length) continue
      const urls = []
      for (const p of paths) {
        try {
          const { data: signed } = await supabase.storage.from('dokumenty').createSignedUrl(p, 300)
          if (signed?.signedUrl) {
            const resp = await fetch(signed.signedUrl)
            const blob = await resp.blob()
            urls.push(await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) }))
          }
        } catch { /* brak jednego ze zdjęć w PDF, nie blokujemy wysyłki/podglądu */ }
      }
      if (urls.length) photoDataUrls[it._key] = urls
      // Jeśli pozycja MIAŁA zdjęcia, ale żadne się nie wczytało — to nie
      // powinno być ciche. Wcześniej brak zdjęcia w PDF-ie nie był w ogóle
      // sygnalizowany, więc wyglądało to jak "losowo jednego zdjęcia nie
      // widać" bez wyjaśnienia dlaczego.
      else failedItems.push(it.name || t('pozycja bez nazwy'))
    }
    if (failedItems.length) {
      toast.error(t('Nie udało się wczytać zdjęć do PDF dla: ') + failedItems.join(', ') + t(' — sprawdź połączenie i spróbuj ponownie.'))
    }
    return photoDataUrls
  }

  // Jeśli wycena ma zapisany własny wygląd (quote.layout_json — z edytora
  // "jak Canva"), PDF generuje się z NIEGO, a nie ze starego, sztywnego
  // szablonu — nowe wyceny domyślnie nie mają layout_json (NULL), więc
  // zachowują dotychczasowy wygląd bez żadnej zmiany, dopóki użytkownik sam
  // nie otworzy i nie zapisze edytora wyglądu.
  const generatePdfBlob = async (photoDataUrls) => {
    if (quote.layout_json) {
      return generateQuotePdfFromLayout({ layout: quote.layout_json, quote, client, contact, company, rows: totalsCalc.rows, totals: totalsCalc.totals, photoDataUrls })
    }
    return generateQuotePdf({ quote, client, contact, company, rows: totalsCalc.rows, totals: totalsCalc.totals, photoDataUrls })
  }

  const handleOpenLayoutEditor = async () => {
    setLayoutLoading(true)
    try {
      const urls = await buildPhotoDataUrls()
      setLayoutPhotoDataUrls(urls)
      setLayoutEditorOpen(true)
    } catch (e) {
      toast.error(t('Nie udało się przygotować podglądu do edytora: ') + (e.message || e))
    }
    setLayoutLoading(false)
  }

  const handleSaveLayout = async (layoutJson) => {
    const { error } = await supabase.from('quotes').update({ layout_json: layoutJson }).eq('id', quoteId)
    if (error) throw error
    setQ({ layout_json: layoutJson })
  }

  const handlePreviewPdf = async () => {
    // Okno musi się otworzyć SYNCHRONICZNIE w reakcji na kliknięcie — jeśli
    // otworzymy je dopiero po zakończeniu generowania PDF (czyli po kilku
    // "await"), Safari/Chrome traktuje to jako popup i blokuje je w ciszy
    // (dlatego wcześniej po kliknięciu "nic się nie działo"). Otwieramy więc
    // pustą kartę od razu, a docelowy adres wstawiamy do niej, gdy PDF będzie
    // gotowy. Dodatkowo trzymamy link w stanie jako trwały fallback do
    // pobrania, na wypadek gdyby przeglądarka i to zablokowała.
    const win = window.open('', '_blank')
    setSending('preview')
    try {
      const photoDataUrls = await buildPhotoDataUrls()
      const blob = await generatePdfBlob(photoDataUrls)
      const url = URL.createObjectURL(blob)
      setPreviewPdfUrl(url)
      if (win) win.location.href = url
      else window.open(url, '_blank')
      // Zapisujemy podgląd trwale do Dokumentów (Storage + tabela documents),
      // żeby "chce go widzieć i żeby był zapisany" — nie tylko chwilowy blob
      // w pamięci przeglądarki, tylko coś, co da się znaleźć później w
      // Dokumentach klienta/projektu, nawet po zamknięciu karty.
      const previewPath = `${quote.client_id}/wycena-podglad-${quote.quote_number || quoteId}.pdf`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(previewPath, blob, { upsert: true, contentType: 'application/pdf' })
      if (!upErr) {
        const { data: { user } } = await supabase.auth.getUser()
        // Ten sam plik (ta sama ścieżka) generuje się wielokrotnie przy
        // każdym "Podglądzie" — zamiast mnożyć wpisy w Dokumentach, jeśli już
        // istnieje, tylko go odświeżamy (bez unikalnego constraintu na
        // file_path w bazie, więc upsert nie zadziała — sprawdzamy ręcznie).
        const { data: existingDoc } = await supabase.from('documents').select('id').eq('file_path', previewPath).maybeSingle()
        if (existingDoc?.id) {
          await supabase.from('documents').update({ uploaded_by: user?.id, created_at: new Date().toISOString() }).eq('id', existingDoc.id)
        } else {
          await supabase.from('documents').insert({
            client_id: quote.client_id, project_id: quote.project_id,
            category: 'Wycena (podgląd)', file_path: previewPath, file_name: `${quote.quote_number || 'wycena'}-podglad.pdf`,
            uploaded_by: user?.id, source: 'manual',
          })
        }
      }
      toast.success(t('Podgląd wygenerowany i zapisany w Dokumentach ✓ Jeśli karta się nie otworzyła, użyj linku „Pobierz wygenerowany PDF” poniżej.'))
    } catch (e) {
      if (win) win.close()
      toast.error(t('Nie udało się wygenerować podglądu: ') + (e.message || e))
    }
    setSending(false)
  }

  const handleSendToClient = async () => {
    if (quote.margin_percent === null || quote.margin_percent === undefined || quote.margin_percent === '') {
      toast.error(t('Wpisz marżę przed wysłaniem do klienta.')); return
    }
    if (!quote.nbp_rate) { toast.error(t('Pobierz kurs NBP dla towaru (CNY) przed wysłaniem do klienta.')); return }
    if ((quote.transport_currency || 'CNY') !== 'PLN' && Number(quote.transport_cost) > 0 && !quote.transport_rate) {
      toast.error(t('Pobierz kurs NBP dla waluty transportu przed wysłaniem do klienta.')); return
    }
    const confirmMsg = quote.status === 'wyslana'
      ? t('Wysłać poprawioną wersję tej wyceny do klienta? Nadpisze poprzedni PDF (ten sam numer wyceny) nowymi danymi.')
      : t('Wysłać tę wycenę do klienta? Wygeneruje się PDF z ceną końcową netto/VAT/brutto w PLN i automatycznie odblokuje 2. etap zamówienia.')
    if (!await confirm(confirmMsg)) return
    const ok = await handleSave(true)
    if (!ok) return
    setSending(true)
    try {
      const photoDataUrls = await buildPhotoDataUrls()
      const blob = await generatePdfBlob(photoDataUrls)
      const pdfPath = `${quote.client_id}/wycena-${quote.quote_number || quoteId}.pdf`
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
    const win = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(quote.pdf_path, 300)
    if (error) { if (win) win.close(); toast.error(t('Nie udało się pobrać PDF: ') + error.message); return }
    if (win) win.location.href = data.signedUrl
    else window.open(data.signedUrl, '_blank')
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
              <div style={{ width: 168, flexShrink: 0 }}>
                <label style={label}>{t(`Zdjęcia (do ${MAX_PHOTOS_PER_ITEM}, pierwsze = okładka na wycenie)`)}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(it.photo_paths || []).map((p, pi) => (
                    <div key={p} style={{ width: 78, height: 78, borderRadius: 9, overflow: 'hidden', position: 'relative', border: `1px solid ${C.border}`, background: C.white }}>
                      <img src={photoUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {pi === 0 && <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 8, fontWeight: 700, background: 'rgba(10,22,40,.75)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>{t("okładka")}</span>}
                      <span onClick={() => removePhoto(it._key, p)} title={t('Usuń zdjęcie')}
                        style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}>✕</span>
                    </div>
                  ))}
                  {(it.photo_paths || []).length < MAX_PHOTOS_PER_ITEM && (
                    // Zwykły div (nie <label>) — dzięki temu kliknięcie tylko go
                    // zaznacza (focus), a nie otwiera od razu okna wyboru pliku,
                    // więc zaraz po kliknięciu można od razu wkleić Ctrl+V.
                    <div
                      tabIndex={0}
                      onPaste={e => handlePastePhoto(it._key, e)}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleAddPhoto(it._key, f) }}
                      onDragOver={e => e.preventDefault()}
                      style={{ width: 78, height: 78, borderRadius: 9, border: `1.5px dashed ${C.border}`, overflow: 'hidden', background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}
                    >
                      <span style={{ fontSize: 22, color: C.muted }}>{busyPhoto === it._key ? '…' : '➕'}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 10, color: C.blue, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                    {t("📁 wybierz plik")}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAddPhoto(it._key, e.target.files?.[0])} />
                  </label>
                  <span style={{ fontSize: 9, color: C.muted }}>{t("lub kliknij pole + i wklej Ctrl+V")}</span>
                </div>
              </div>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={label}>{t("Nazwa towaru")}</label>
                <textarea rows={2} style={{ ...field, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, minHeight: 60 }}
                  value={it.name} onChange={e => setItem(it._key, { name: e.target.value })} placeholder={t("np. QINGSHEF (Duży) 轻奢F（大）")} />
              </div>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={label}>{t("Specyfikacja")}</label>
                <textarea rows={2} style={{ ...field, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, minHeight: 60 }}
                  value={it.specification} onChange={e => setItem(it._key, { specification: e.target.value })} placeholder={t("np. 96m², dwa pokoje, jedna łazienka, taras")} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={label}>{t("✨ Poproś AI o zmianę nazwy/specyfikacji (opcjonalnie)")}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={{ ...field, flex: 1, minWidth: 200 }} value={aiPrompts[it._key] || ''}
                  onChange={e => setAiPrompts(prev => ({ ...prev, [it._key]: e.target.value }))}
                  placeholder={t("np. „skróć nazwę”, „przetłumacz na angielski”, „dodaj wymiary”")} />
                <button onClick={() => handleAiRefine(it._key)} disabled={busyAiRefine === it._key || !aiPrompts[it._key]?.trim()}
                  style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (busyAiRefine === it._key || !aiPrompts[it._key]?.trim()) ? .6 : 1 }}>
                  {busyAiRefine === it._key ? t('Modyfikuję…') : t('✨ Zastosuj')}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(7,1fr)', gap: 8, marginTop: 10 }}>
              <div><label style={label}>{t("Ilość")}</label><input type="text" inputMode="decimal" style={field} value={it.qty} onChange={e => setItem(it._key, { qty: e.target.value })} /></div>
              <div>
                <label style={label}>{t("Jednostka")}</label>
                <select style={field} value={UNIT_OPTIONS.includes(it.unit) ? it.unit : '__custom'}
                  onChange={e => setItem(it._key, { unit: e.target.value === '__custom' ? '' : e.target.value })}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  <option value="__custom">{t('Inne…')}</option>
                </select>
                {!UNIT_OPTIONS.includes(it.unit) && (
                  <input style={{ ...field, marginTop: 4 }} value={it.unit} onChange={e => setItem(it._key, { unit: e.target.value })} placeholder={t('wpisz jednostkę')} />
                )}
              </div>
              <div><label style={label}>{t("Cena EXW (CNY/szt.)")}</label><input type="text" inputMode="decimal" style={field} value={it.unit_price_cny} onChange={e => setItem(it._key, { unit_price_cny: e.target.value })} /></div>
              <div><label style={label}>{t("CBM (m³)")}</label><input type="text" inputMode="decimal" style={field} value={it.cbm} onChange={e => setItem(it._key, { cbm: e.target.value })} /></div>
              <div><label style={label}>{t("Waga (kg)")}</label><input type="text" inputMode="decimal" style={field} value={it.weight_kg} onChange={e => setItem(it._key, { weight_kg: e.target.value })} /></div>
              <div><label style={label}>{t("Kontener (opc.)")}</label><input style={field} value={it.container_note} onChange={e => setItem(it._key, { container_note: e.target.value })} placeholder="2*40HQ" /></div>
              <div><label style={label}>{t("Czas produkcji (dni)")}</label><input type="text" inputMode="decimal" style={field} value={it.production_days} onChange={e => setItem(it._key, { production_days: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr auto auto', gap: 8, marginTop: 10, alignItems: 'end' }}>
              <div><label style={label}>{t("Kod CN/HS")}</label><input style={field} value={it.hs_code} onChange={e => setItem(it._key, { hs_code: e.target.value })} placeholder="9406.10" /></div>
              <div><label style={label}>{t("Stawka cła (%)")}</label><input type="text" inputMode="decimal" style={field} value={it.duty_rate_percent} onChange={e => setItem(it._key, { duty_rate_percent: e.target.value })} /></div>
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
            {it.hs_code && describeHsCode(it.hs_code) && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {t("Dział")} {String(it.hs_code).replace(/\D/g, '').slice(0, 2)}: <strong>{t(describeHsCode(it.hs_code))}</strong> {t("(orientacyjnie, wg pierwszych cyfr kodu — zawsze zweryfikuj dokładny kod w ISZTAR)")}
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={addItem} style={{ padding: '8px 14px', borderRadius: 8, border: `1px dashed ${C.border}`, background: 'transparent', color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{t("+ Dodaj pozycję")}</button>
          <label style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            {importing ? t('Importowanie…') : t('📥 Importuj z Excela')}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} disabled={importing} onChange={e => handleImportExcel(e.target.files?.[0])} />
          </label>
          <button onClick={() => setAiFilesOpen(true)}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            🤖 {t("Stwórz z plików (AI)")}
          </button>
          <div style={{ fontSize: 9.5, color: C.muted, alignSelf: 'center' }}>{t("Rozpozna kolumny typu Name/Specification/QTY/EXW Unit Price/Volume — resztę uzupełnisz ręcznie.")}</div>
        </div>
      </div>

      {aiFilesOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !aiFilesBusy && setAiFilesOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 24, width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🤖 {t("Stwórz pozycje z plików (AI)")}</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              {t("Wgraj zdjęcia produktów, PDF ze specyfikacją/cennikiem, pliki Excel z wyceną albo notatki tekstowe — możesz mieszać różne typy naraz. Pliki Excel są odczytywane tym samym mechanizmem co \"Importuj z Excela\" (nazwa/ilość/cena/zdjęcia z komórek), reszta plików trafia do AI. Rozpoznane pozycje i zdjęcia łączą się w jedną listę.")}
            </div>
            <label style={{ display: 'block', padding: '10px 14px', borderRadius: 9, border: `1.5px dashed ${C.purple}`, background: C.plight, color: C.purple, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 10 }}>
              + {t("Wybierz pliki")} ({aiFilesList.length}/{MAX_AI_FILES})
              <input type="file" multiple accept="image/*,.pdf,.txt,.csv,.xlsx,.xls" style={{ display: 'none' }} disabled={aiFilesBusy}
                onChange={e => { handleAiFilesSelected(e.target.files); e.target.value = '' }} />
            </label>
            {aiFilesList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
                {aiFilesList.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 9px', borderRadius: 7, background: C.bg }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.type?.startsWith('image/') ? '🖼️' : f.type === 'application/pdf' ? '📄' : '📎'} {f.name}</span>
                    <span style={{ color: C.muted }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <span onClick={() => removeAiFile(i)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700 }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            <label style={label}>{t("Dodatkowa instrukcja (opcjonalnie)")}</label>
            <textarea value={aiFilesInstruction} onChange={e => setAiFilesInstruction(e.target.value)} rows={2}
              placeholder={t("np. \"to są 3 różne modele domków, każde zdjęcie to inny model\"")}
              style={{ ...field, resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAiFilesOpen(false)} disabled={aiFilesBusy}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj")}</button>
              <button onClick={handleGenerateFromFiles} disabled={aiFilesBusy || !aiFilesList.length}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (aiFilesBusy || !aiFilesList.length) ? .6 : 1 }}>
                {aiFilesBusy ? t("Analizuję pliki…") : t("🤖 Generuj pozycje")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={sectionTitle}>💰 {t("Transport, cło i marża (zespół polski)")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <div><label style={label}>{t("Szacowany transport")}</label><input type="text" inputMode="decimal" style={field} value={quote.transport_cost || ''} onChange={e => setQ({ transport_cost: e.target.value })} /></div>
          <div><label style={label}>{t("Waluta transportu")}</label>
            <select style={field} value={quote.transport_currency || 'CNY'} onChange={e => handleTransportCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>{t("Marża (%)")}</label>
            <input type="text" inputMode="decimal" style={field} value={quote.margin_percent ?? ''} onChange={e => setQ({ margin_percent: e.target.value })} placeholder="np. 30" />
          </div>
          <div><label style={label}>{t("Ważna do")}</label><input type="date" style={field} value={quote.valid_until || ''} onChange={e => setQ({ valid_until: e.target.value })} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={quote.include_duty ?? true} onChange={e => setQ({ include_duty: e.target.checked })} />
          {t("Wliczaj cło do kosztu (obliczane od wartości towar + transport, wg stawki każdej pozycji)")}
        </label>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Pozycja', 'Towar', 'Transport (udział)', 'Wart. celna', 'Cło', 'Koszt razem', 'Cena dla klienta netto (PLN)'].map(h => (
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
                <td style={{ padding: '8px', textAlign: 'right', color: C.blue, fontSize: 13 }}>{fmt(totalsCalc.totals.finalPrice, 2)} PLN</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Ten rozkład (marża, cło, koszt towaru osobno) widzi tylko zespół wewnętrzny. Towar jest w cenie fabrycznej CNY, transport w walucie wybranej wyżej — obydwa są tu już przeliczone na złotówki wg kursów NBP poniżej. Na PDF do klienta trafia wyłącznie cena końcowa netto/VAT/brutto w PLN.")}</div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>💱 {t("Kursy walut → PLN (NBP + prowizja banku)")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, marginBottom: 14, alignItems: 'end' }}>
          <div>
            <label style={label}>{t("Kurs średni NBP (CNY→PLN, towar)")}</label>
            <div style={{ ...field, background: C.bg, fontWeight: 700 }}>
              {quote.nbp_rate ? `${quote.nbp_rate} ${t("z dnia")} ${quote.nbp_rate_date}` : t("— nie pobrano —")}
            </div>
          </div>
          <div>
            <button onClick={handleFetchNbpRate} disabled={fetchingRate}
              style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: fetchingRate ? .6 : 1 }}>
              {fetchingRate ? t('Pobieranie…') : t('🔄 Odśwież kurs CNY')}
            </button>
          </div>
          <div>
            <label style={label}>{t("Prowizja banku (%)")}</label>
            <input type="text" inputMode="decimal" style={field} value={quote.bank_commission_percent ?? ''} onChange={e => setQ({ bank_commission_percent: e.target.value })} placeholder="np. 3" />
          </div>
          <div>
            <label style={label}>{t("Kurs efektywny (towar)")}</label>
            <div style={{ ...field, background: C.bg, fontWeight: 700 }}>{cnyRateEff ? fmt(cnyRateEff, 4) : '—'}</div>
          </div>
        </div>
        {(quote.transport_currency || 'CNY') !== 'PLN' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={label}>{t(`Kurs średni NBP (${quote.transport_currency || 'CNY'}→PLN, transport)`)}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>
                {quote.transport_rate ? `${quote.transport_rate} ${t("z dnia")} ${quote.transport_rate_date}` : t("— nie pobrano —")}
              </div>
            </div>
            <div>
              <button onClick={handleFetchTransportRate} disabled={fetchingTransportRate}
                style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: fetchingTransportRate ? .6 : 1 }}>
                {fetchingTransportRate ? t('Pobieranie…') : t(`🔄 Odśwież kurs ${quote.transport_currency || 'CNY'}`)}
              </button>
            </div>
            <div>
              <label style={label}>{t("Kurs efektywny (transport)")}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>{transportRateEff ? fmt(transportRateEff, 4) : '—'}</div>
            </div>
            <div />
          </div>
        )}
        <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Kursy zapisują się na wycenie w momencie zapisu/wysyłki — nie zmieniają się już potem samoczynnie. BNP Paribas nie udostępnia publicznego API, dlatego bazujemy na oficjalnym kursie średnim NBP i doliczamy prowizję banku ręcznie.")}</div>
      </div>

      {(() => {
        const tCur = quote.transport_currency || 'CNY'
        const marginAmount = totalsCalc.totals.finalPrice - totalsCalc.totals.landedCost
        const steps = [
          { label: t('Kurs towaru (NBP + prowizja banku)'), calc: `1 CNY = ${fmt(quote.nbp_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(cnyRateEff, 4)} PLN` },
          { label: t('Wartość towaru'), calc: t('suma: ilość × cena EXW × kurs, dla wszystkich pozycji'), value: `${fmt(totalsCalc.totals.goodsValue, 2)} PLN` },
          ...(tCur !== 'PLN' ? [{ label: t(`Kurs transportu (${tCur})`), calc: `1 ${tCur} = ${fmt(quote.transport_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(transportRateEff, 4)} PLN` }] : []),
          { label: t('Transport'), calc: `${fmt(toNum(quote.transport_cost), 2)} ${tCur} × ${fmt(transportRateEff, 4)}`, value: `${fmt(totalsCalc.totals.transportShare, 2)} PLN` },
          { label: t('Wartość celna (towar + transport)'), calc: t('wartość towaru + transport'), value: `${fmt(totalsCalc.totals.customsValue, 2)} PLN` },
          { label: t('Cło'), calc: t('wartość celna × stawka cła każdej pozycji'), value: `${fmt(totalsCalc.totals.dutyAmount, 2)} PLN` },
          { label: t('Koszt razem (bez marży)'), calc: t('wartość celna + cło'), value: `${fmt(totalsCalc.totals.landedCost, 2)} PLN` },
          { label: t(`Marża (${quote.margin_percent || 0}%)`), calc: t('koszt razem × marża%'), value: `${fmt(marginAmount, 2)} PLN`, highlight: true },
          { label: t('Netto (cena dla klienta bez VAT)'), calc: t('koszt razem + marża'), value: `${fmt(totalsCalc.totals.finalPrice, 2)} PLN`, highlight: true },
          { label: t('VAT (23%)'), calc: t('netto × 23%'), value: `${fmt(totalsCalc.totals.vatAmount, 2)} PLN` },
          { label: t('Brutto (cena końcowa z VAT)'), calc: t('netto + VAT'), value: `${fmt(totalsCalc.totals.finalPriceGross, 2)} PLN`, highlight: true },
        ]
        return (
          <div style={card}>
            <div style={sectionTitle}>🧮 {t("Jak liczymy tę wycenę — krok po kroku (na żywo)")}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.highlight ? C.orange : C.bg, color: s.highlight ? '#fff' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: s.highlight ? C.orange : C.text }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{s.calc}</div>
                  </div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 800, color: s.highlight ? C.orange : C.text, whiteSpace: 'nowrap' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div style={card}>
        <div style={sectionTitle}>🧾 {t("Cena dla klienta (PLN) — aktualizuje się na żywo przy każdej zmianie marży/kursów")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
          <div style={{ padding: '12px 14px', borderRadius: 9, background: C.bg, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t("Koszt (bez marży)")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>{fmt(totalsCalc.totals.landedCost, 2)} PLN</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 9, background: C.olight, border: `1px solid ${C.orange}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.orange, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t(`Netto (z marżą ${quote.margin_percent || 0}%)`)}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4, color: C.orange }}>{fmt(totalsCalc.totals.finalPrice, 2)} PLN</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 9, background: C.bg, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t("VAT (23%)")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>{fmt(totalsCalc.totals.vatAmount, 2)} PLN</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 9, background: C.blight, border: `1px solid ${C.bmid}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t("Brutto")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4, color: C.blue }}>{fmt(totalsCalc.totals.finalPriceGross, 2)} PLN</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10 }}>
          {t("Marża w kwocie:")} <strong>{fmt(totalsCalc.totals.finalPrice - totalsCalc.totals.landedCost, 2)} PLN</strong>
          {' · '}{t("Cena bazowa towaru od zespołu chińskiego (pomocniczo):")} <strong>{fmt(totalsCalc.totals.goodsValue && cnyRateEff ? totalsCalc.totals.goodsValue / cnyRateEff : 0, 2)} CNY</strong>
        </div>
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
        <button onClick={handlePreviewPdf} disabled={!!sending}
          style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #B48C28, #E4C158)', color: '#0A1628', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: sending ? .7 : 1, boxShadow: '0 3px 12px rgba(180,140,40,0.45)' }}>
          {sending === 'preview' ? t("Generowanie…") : t("🧾 Wygeneruj wycenę (podgląd)")}
        </button>
        <button onClick={handleOpenLayoutEditor} disabled={layoutLoading}
          style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: layoutLoading ? .6 : 1 }}>
          {layoutLoading ? t("Wczytywanie…") : t("🎨 Edytuj wygląd wyceny")}
        </button>
        {quote.layout_json && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.purple, alignSelf: 'center' }}>{t("● własny wygląd")}</span>}
        {previewPdfUrl && (
          <a href={previewPdfUrl} target="_blank" rel="noreferrer" download={`podglad-${quote.quote_number || 'wycena'}.pdf`}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.bmid}`, background: C.blight, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.blue, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ⬇ {t("Pobierz wygenerowany PDF")}
          </a>
        )}
        {quote.status === 'szkic_cn' && (
          <button onClick={handleSendToPL} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {t("Prześlij do zespołu PL →")}
          </button>
        )}
        {(quote.status === 'do_marzy_pl' || quote.status === 'wyslana') && (
          <button onClick={handleSendToClient} disabled={sending} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
            {sending ? t("Wysyłanie…") : quote.status === 'wyslana' ? t("📤 Wyślij poprawioną wycenę do klienta") : t("📤 Wyślij do klienta")}
          </button>
        )}
        {quote.status === 'wyslana' && (
          <button onClick={handleDownloadPdf} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2 }}>{t("Pobierz ostatnio wysłany PDF")}</button>
        )}
      </div>

      {layoutEditorOpen && layoutPhotoDataUrls !== null && (
        <QuoteLayoutEditor
          quote={quote} client={client} contact={contact} company={company}
          rows={totalsCalc.rows} totals={totalsCalc.totals} photoDataUrls={layoutPhotoDataUrls}
          onSave={handleSaveLayout}
          onClose={() => setLayoutEditorOpen(false)}
        />
      )}
    </div>
  )
}
