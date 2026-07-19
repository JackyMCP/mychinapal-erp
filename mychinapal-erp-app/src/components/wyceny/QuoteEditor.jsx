import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'
import { safeFileName, isFileTooBig, MAX_FILE_SIZE_MB } from '../../lib/files'
import { computeQuoteTotals, toNum, STATUS_LABELS } from './calc'
import { describeHsCode } from './hsChapters'
import { parseQuoteExcel } from './excelImport'
import ExcelImportPreview from './ExcelImportPreview'
import { syncQuoteItemsWithCatalog } from '../../lib/productCatalog'
import { exportQuoteToExcelBlob, loadLogoNavyDataUrl } from './excelExport'
import ExcelLivePreview from './ExcelLivePreview'

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
  unit_price_pln: null,
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
  // Autozapis — cokolwiek zostanie wpisane w polu albo wgrane (zdjęcie,
  // import z Excela/AI) ma zostać zapisane samo, bez konieczności pamiętania
  // o kliknięciu "Zapisz". Debounce 1.2s od ostatniej zmiany, żeby nie walić
  // zapytaniem do bazy przy każdym pojedynczym znaku wpisywanym w polu.
  const [autosaveStatus, setAutosaveStatus] = useState('idle') // idle | pending | saving | saved | error
  const autosaveTimer = useRef(null)
  const skipNextAutosave = useRef(true)
  const [saving, setSaving] = useState(false)
  const [busyPhoto, setBusyPhoto] = useState(null)
  const [busyAi, setBusyAi] = useState(null)
  const [aiPrompts, setAiPrompts] = useState({})
  const [busyAiRefine, setBusyAiRefine] = useState(null)
  const [sending, setSending] = useState(false)
  const [photoUrls, setPhotoUrls] = useState({})
  const [previewExcelUrl, setPreviewExcelUrl] = useState(null)
  const [aiFilesOpen, setAiFilesOpen] = useState(false)
  const [aiFilesList, setAiFilesList] = useState([])
  const [aiFilesInstruction, setAiFilesInstruction] = useState('')
  const [aiFilesBusy, setAiFilesBusy] = useState(false)
  // Logo w wersji granatowej — dokument dla klienta to teraz plik Excel z
  // białym tłem arkusza (zob. excelExport.js, zadanie #219), więc potrzebny
  // jest granatowy wariant logo (biały, używany dawniej w PDF na granatowym
  // nagłówku, byłby na białym tle niewidoczny).
  const [logoNavyDataUrl, setLogoNavyDataUrl] = useState(null)
  useEffect(() => { loadLogoNavyDataUrl().then(setLogoNavyDataUrl) }, [])
  // Podgląd importu z Excela — sparsowane wiersze CZEKAJĄ tutaj do
  // zatwierdzenia (albo anulowania) przez użytkownika, zanim cokolwiek z
  // nich trafi do wyceny (zdjęcia jeszcze NIE są wgrane do Storage na tym
  // etapie — dopiero po zatwierdzeniu, żeby nie wgrywać zdjęć odrzuconych wierszy).
  const [excelPreviewRows, setExcelPreviewRows] = useState(null)
  const [excelPreviewFileName, setExcelPreviewFileName] = useState('')
  // Asystent AI wyceny — czat korekcyjny: polecenia w naturalnym języku
  // stosowane od razu do CAŁEJ listy pozycji (nie tylko jednej), np. "zwiększ
  // ilość wszystkich o 10%" albo "usuń pozycje z fotelami". Osobna edge
  // function (quote-ai-assistant) od "Poproś AI o zmianę" per-pozycja.
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [aiChatMessages, setAiChatMessages] = useState([])
  const [aiChatInput, setAiChatInput] = useState('')
  const [aiChatBusy, setAiChatBusy] = useState(false)
  // Podwójna weryfikacja — niezależny, drugi przebieg AI (osobny od
  // suggest-customs-code) patrzący na zdjęcie każdej pozycji i sprawdzający,
  // czy realnie pasuje do nazwy/specyfikacji/kodu CN — łapie pomyłki po
  // imporcie z Excela (złe zdjęcie podpięte pod złą pozycję itp.).
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyResults, setVerifyResults] = useState({})

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
    // Świeżo wczytane dane NIE mają wywoływać autozapisu (to nie jest
    // zmiana wprowadzona przez użytkownika) — dopiero KOLEJNA zmiana stanu
    // (po tym wczytaniu) ma go uzbroić.
    skipNextAutosave.current = true
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
  // Pozycje z Excela/plików AI często mają nazwę/specyfikację po chińsku albo
  // angielsku (oryginalne dane fabryczne) — wycena dla polskiego klienta ma
  // być w całości po polsku. Tłumaczymy WSZYSTKIE zaimportowane pozycje naraz
  // (jedno zapytanie zamiast jednego na pozycję) zanim trafią do formularza;
  // tekst już po polsku model ma zwrócić bez zmian, więc to bezpieczne do
  // uruchamiania zawsze, niezależnie od źródłowego języka.
  const translateItemsToPolish = async (readyItems) => {
    const toTranslate = readyItems.map((it, i) => ({ i, name: it.name || '', specification: it.specification || '' })).filter(x => x.name || x.specification)
    if (!toTranslate.length) return
    try {
      const { data, error } = await supabase.functions.invoke('translate-quote-item', { body: { items: toTranslate } })
      if (error) throw error
      for (const t of (data?.items || [])) {
        const it = readyItems[t.i]
        if (!it) continue
        if (t.name) it.name = t.name
        if (t.specification) it.specification = t.specification
      }
    } catch {
      // Najlepszy wysiłek — jeśli tłumaczenie się nie uda, pozycje zostają w
      // oryginalnym języku (nadal w pełni edytowalne ręcznie).
    }
  }

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
  // Odprawa celna w Chinach i dostawa do klienta w Polsce — dwa nowe koszty
  // globalne doliczane przez zespół PL, każdy z własną walutą/kursem NBP,
  // dokładnie jak transport (patrz calc.js: rozkładane na pozycje
  // proporcjonalnie do wartości towaru, wliczane w koszt PRZED marżą).
  const chinaCustomsClearanceRateEff = (quote?.china_customs_clearance_currency || 'PLN') === 'PLN'
    ? 1
    : toNum(quote?.china_customs_clearance_rate) * (1 + toNum(quote?.bank_commission_percent) / 100)
  const plDeliveryRateEff = (quote?.pl_delivery_currency || 'PLN') === 'PLN'
    ? 1
    : toNum(quote?.pl_delivery_rate) * (1 + toNum(quote?.bank_commission_percent) / 100)
  const VAT_PERCENT = 23

  const totalsCalc = useMemo(() => computeQuoteTotals(items, {
    transportCost: quote?.transport_cost || 0, includeDuty: quote?.include_duty ?? true, marginPercent: quote?.margin_percent || 0,
    cnyRate: cnyRateEff, transportRate: transportRateEff, vatPercent: VAT_PERCENT,
    chinaCustomsClearanceCost: quote?.china_customs_clearance_cost || 0, chinaCustomsClearanceRate: chinaCustomsClearanceRateEff,
    plDeliveryToClientCost: quote?.pl_delivery_to_client_cost || 0, plDeliveryRate: plDeliveryRateEff,
  }), [items, quote?.transport_cost, quote?.include_duty, quote?.margin_percent, cnyRateEff, transportRateEff,
      quote?.china_customs_clearance_cost, chinaCustomsClearanceRateEff, quote?.pl_delivery_to_client_cost, plDeliveryRateEff])

  // Gdy CHOĆ JEDNA pozycja ma ręcznie ustawioną cenę PLN/szt., różnica
  // netto-koszt nie wynika już wyłącznie z globalnego pola "Marża (%)" —
  // pokazywanie tamtej wartości % obok kwoty, która z niej nie pochodzi,
  // wyglądało jak sprzeczność ("Marża (0%)" obok -243,66 PLN). Dlatego
  // wszędzie w podsumowaniu pokazujemy efektywny % wyliczony z realnych
  // kwot — zawsze spójny z wartością PLN wyświetloną obok.
  const hasAnyManualPln = useMemo(() => items.some(it => it.unit_price_pln !== null && it.unit_price_pln !== undefined && it.unit_price_pln !== ''), [items])
  const effectiveMarginPct = totalsCalc.totals.landedCost > 0
    ? ((totalsCalc.totals.finalPrice - totalsCalc.totals.landedCost) / totalsCalc.totals.landedCost) * 100
    : 0

  const setQ = (patch) => setQuote(prev => ({ ...prev, ...patch }))
  const setItem = (key, patch) => setItems(prev => prev.map(it => it._key === key ? { ...it, ...patch } : it))
  // Ręczna cena "PLN/szt." na pozycji (patrz calc.js hasManualPln) całkowicie
  // ZASTĘPUJE globalną marżę dla TEJ pozycji — dopóki jest ustawiona, zmiana
  // pola "Marża (%)" nie ma na nią żadnego wpływu (to był realnie zgłoszony
  // błąd: użytkownik zmieniał marżę, a cena/wykres "krok po kroku" się nie
  // ruszał, bo pozycja miała już wcześniej wpisaną/zasugerowaną własną cenę
  // PLN). Żeby marża globalna zawsze realnie działała, wpisanie jej czyści
  // wszystkie ręczne ceny PLN pozycji — jedno źródło prawdy zamiast dwóch
  // cichо konkurujących mechanizmów.
  const handleMarginChange = (val) => {
    const hadManual = items.some(it => it.unit_price_pln !== null && it.unit_price_pln !== undefined && it.unit_price_pln !== '')
    setQ({ margin_percent: val })
    if (hadManual) {
      setItems(prev => prev.map(it => ({ ...it, unit_price_pln: null })))
      toast.success(t('Marża globalna zastosowana — ręcznie ustawione ceny PLN/szt. na pozycjach zostały wyczyszczone.'))
    }
  }
  const addItem = () => setItems(prev => [...prev, blankItem()])
  const [importing, setImporting] = useState(false)
  // Krok 1: tylko parsowanie — pokazujemy podgląd, NIC jeszcze nie jest
  // wgrywane do Storage ani wysyłane do AI. Dopiero po zatwierdzeniu podglądu
  // (handleConfirmExcelImport) leci reszta: tłumaczenie, sugestia CN/HS,
  // wgranie zdjęć. Dzięki temu błędnie sparsowany/dopasowany wiersz (zła
  // kolumna, złe zdjęcie) można poprawić albo usunąć, zanim cokolwiek
  // kosztownego się z nim stanie.
  const handleImportExcel = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const parsed = await parseQuoteExcel(file)
      if (!parsed.length) { toast.error(t('Nie udało się rozpoznać żadnych pozycji w tym pliku — sprawdź nagłówki kolumn lub wpisz pozycje ręcznie.')); setImporting(false); return }
      setExcelPreviewRows(parsed)
      setExcelPreviewFileName(file.name || '')
    } catch (e) {
      toast.error(t('Nie udało się odczytać pliku Excel: ') + (e.message || e))
    }
    setImporting(false)
  }

  const handleCancelExcelPreview = () => {
    setExcelPreviewRows(null)
    setExcelPreviewFileName('')
  }

  // Krok 2: użytkownik zatwierdził (ewentualnie poprawiony/okrojony) podgląd
  // — dopiero teraz wgrywamy zdjęcia, tłumaczymy i pytamy AI o kod CN/HS.
  const handleConfirmExcelImport = async (confirmedRows) => {
    setExcelPreviewRows(null)
    setExcelPreviewFileName('')
    setImporting(true)
    try {
      const parsed = confirmedRows
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
              uploaded_by: user?.id, source: 'excel_import', visible_in_files: false,
            })
            photoPaths.push(path)
          } catch { uploadFailCount++ }
        }
        readyItems.push({ ...blankItem(), ...p, photo_paths: photoPaths })
      }

      // Wycena ma być w całości po polsku — tłumaczymy nazwy/specyfikacje
      // (często chińskie/angielskie w plikach fabrycznych) PRZED sugestią
      // CN/HS, żeby ta sugestia też pracowała na polskim tekście.
      await translateItemsToPolish(readyItems)

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
      toast.success(t(`Zaimportowano ${parsed.length} pozycji`) + photoMsg + t(' — nazwy/opisy przetłumaczone na polski, sugestie kodu CN/HS i cła uzupełnione automatycznie, sprawdź je (zwłaszcza w ISZTAR) i zweryfikuj ceny przed zapisaniem.'))
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
      uploaded_by: userId, source: 'ai_files_import', visible_in_files: false,
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
                  uploaded_by: user?.id, source: 'excel_import', visible_in_files: false,
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

      await translateItemsToPolish(readyItems)

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
      toast.success(t(`Utworzono ${readyItems.length} pozycji`) + (parts.length ? ` (${parts.join(', ')})` : '') + t(' — nazwy/opisy przetłumaczone na polski, sugestie CN/HS i cła uzupełnione automatycznie, sprawdź je i zweryfikuj ceny.'))
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
        uploaded_by: user?.id, source: 'manual', visible_in_files: false,
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

  // Przeciąganie zdjęć — w ramach JEDNEJ pozycji zmienia tylko kolejność
  // (pierwsze zdjęcie w tablicy zawsze jest okładką, patrz etykieta "okładka"
  // niżej), a przeciągnięcie na INNĄ pozycję PRZENOSI zdjęcie między
  // pozycjami. To drugie jest potrzebne, bo automatyczne dopasowanie zdjęć do
  // wierszy przy imporcie Excela od zespołu CN działa na podstawie pozycji
  // obrazka w arkuszu i czasem "rozjeżdża się" o jeden wiersz (zdjęcie
  // wizualnie nachodzące na granicę dwóch wierszy trafia do złego wiersza) —
  // to jedyny sposób, żeby to poprawić ręcznie bez usuwania i wgrywania
  // zdjęcia na nowo.
  const draggedPhoto = useRef(null) // { key, path }
  const movePhoto = (fromKey, fromPath, toKey, toPath) => {
    if (!fromKey || !fromPath) return
    if (fromKey === toKey) {
      if (fromPath === toPath) return
      const current = items.find(i => i._key === toKey)
      const paths = [...(current?.photo_paths || [])]
      const fromIdx = paths.indexOf(fromPath)
      if (fromIdx === -1) return
      paths.splice(fromIdx, 1)
      const toIdx = toPath ? paths.indexOf(toPath) : paths.length
      paths.splice(toIdx === -1 ? paths.length : toIdx, 0, fromPath)
      setItem(toKey, { photo_paths: paths })
      return
    }
    const sourceItem = items.find(i => i._key === fromKey)
    const targetItem = items.find(i => i._key === toKey)
    if (!sourceItem || !targetItem) return
    if ((targetItem.photo_paths || []).length >= MAX_PHOTOS_PER_ITEM) {
      toast.error(t(`Ta pozycja ma już maksymalnie ${MAX_PHOTOS_PER_ITEM} zdjęć.`))
      return
    }
    const newSourcePaths = (sourceItem.photo_paths || []).filter(p => p !== fromPath)
    const targetPaths = [...(targetItem.photo_paths || [])]
    const toIdx = toPath ? targetPaths.indexOf(toPath) : targetPaths.length
    targetPaths.splice(toIdx === -1 ? targetPaths.length : toIdx, 0, fromPath)
    setItems(prev => prev.map(p => {
      if (p._key === fromKey) return { ...p, photo_paths: newSourcePaths }
      if (p._key === toKey) return { ...p, photo_paths: targetPaths }
      return p
    }))
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

  // Te same wzorce (osobny kurs NBP na walutę, kasowanie starego kursu przy
  // zmianie waluty) powtórzone dla dwóch nowych kosztów globalnych: odprawa
  // celna w Chinach i dostawa do klienta w Polsce.
  const [fetchingChinaCustomsRate, setFetchingChinaCustomsRate] = useState(false)
  const handleFetchChinaCustomsRate = async (currencyOverride = null) => {
    const cur = currencyOverride || quote.china_customs_clearance_currency || 'PLN'
    if (cur === 'PLN') { toast.error(t('Odprawa w PLN nie wymaga przeliczenia kursu.')); return }
    setFetchingChinaCustomsRate(true)
    try {
      const { mid, effectiveDate } = await fetchNbpRate(cur)
      setQ({ china_customs_clearance_rate: mid, china_customs_clearance_rate_date: effectiveDate })
      toast.success(t(`Pobrano kurs NBP: 1 ${cur} = ${mid} PLN (${effectiveDate})`))
    } catch (e) {
      toast.error(t('Nie udało się pobrać kursu z NBP: ') + (e.message || e))
    }
    setFetchingChinaCustomsRate(false)
  }
  const handleChinaCustomsCurrencyChange = (newCurrency) => {
    setQ({ china_customs_clearance_currency: newCurrency, china_customs_clearance_rate: null, china_customs_clearance_rate_date: null })
    if (newCurrency !== 'PLN') handleFetchChinaCustomsRate(newCurrency)
  }

  const [fetchingPlDeliveryRate, setFetchingPlDeliveryRate] = useState(false)
  const handleFetchPlDeliveryRate = async (currencyOverride = null) => {
    const cur = currencyOverride || quote.pl_delivery_currency || 'PLN'
    if (cur === 'PLN') { toast.error(t('Dostawa w PLN nie wymaga przeliczenia kursu.')); return }
    setFetchingPlDeliveryRate(true)
    try {
      const { mid, effectiveDate } = await fetchNbpRate(cur)
      setQ({ pl_delivery_rate: mid, pl_delivery_rate_date: effectiveDate })
      toast.success(t(`Pobrano kurs NBP: 1 ${cur} = ${mid} PLN (${effectiveDate})`))
    } catch (e) {
      toast.error(t('Nie udało się pobrać kursu z NBP: ') + (e.message || e))
    }
    setFetchingPlDeliveryRate(false)
  }
  const handlePlDeliveryCurrencyChange = (newCurrency) => {
    setQ({ pl_delivery_currency: newCurrency, pl_delivery_rate: null, pl_delivery_rate_date: null })
    if (newCurrency !== 'PLN') handleFetchPlDeliveryRate(newCurrency)
  }

  // Automatyczne pobranie kursów NBP przy otwarciu wyceny, jeśli jeszcze nie
  // są ustawione — dzięki temu cena dla klienta liczy się i wyświetla "od
  // razu" (na żywo), bez konieczności ręcznego klikania "Odśwież kurs" przy
  // każdym otwarciu wyceny.
  useEffect(() => {
    if (!quote?.id) return
    if (!quote.nbp_rate) handleFetchNbpRate()
    if ((quote.transport_currency || 'CNY') !== 'PLN' && !quote.transport_rate) handleFetchTransportRate()
    if ((quote.china_customs_clearance_currency || 'PLN') !== 'PLN' && !quote.china_customs_clearance_rate) handleFetchChinaCustomsRate()
    if ((quote.pl_delivery_currency || 'PLN') !== 'PLN' && !quote.pl_delivery_rate) handleFetchPlDeliveryRate()
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
        if (data?.verified) {
          toast.success(t('Sugestia AI wstawiona i zweryfikowana w prawdziwym rejestrze ISZTAR — mimo to warto rzucić okiem przed wysyłką.'))
        } else {
          toast.error(t('Sugestia AI wstawiona, ale kodu NIE udało się potwierdzić w ISZTAR — koniecznie sprawdź ręcznie i uzupełnij stawkę cła.'))
        }
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

  // Czat korekcyjny — jedno polecenie, zastosowane do WSZYSTKICH pasujących
  // pozycji naraz (edge function sama decyduje, których pozycji dotyczy).
  const handleAiChatSend = async () => {
    const instruction = aiChatInput.trim()
    if (!instruction || aiChatBusy) return
    setAiChatBusy(true)
    const history = aiChatMessages
    setAiChatMessages(prev => [...prev, { role: 'user', text: instruction }])
    setAiChatInput('')
    try {
      const itemsForApi = items.map(it => ({
        key: it._key, name: it.name, specification: it.specification, qty: it.qty, unit: it.unit,
        unit_price_cny: it.unit_price_cny, cbm: it.cbm, weight_kg: it.weight_kg,
        hs_code: it.hs_code, duty_rate_percent: it.duty_rate_percent,
      }))
      const { data, error } = await supabase.functions.invoke('quote-ai-assistant', {
        body: { items: itemsForApi, instruction, history },
      })
      if (error) throw error
      const changes = Array.isArray(data?.changes) ? data.changes : []
      const deleteKeys = new Set(changes.filter(c => c.delete).map(c => c.key))
      if (deleteKeys.size) {
        const idsToDelete = items.filter(it => deleteKeys.has(it._key) && it.id).map(it => it.id)
        if (idsToDelete.length) setDeletedIds(prev => [...prev, ...idsToDelete])
      }
      const patchByKey = Object.fromEntries(
        changes.filter(c => !c.delete && c.key).map(({ key, ...rest }) => [key, rest])
      )
      setItems(prev => prev
        .filter(it => !deleteKeys.has(it._key))
        .map(it => (patchByKey[it._key] ? { ...it, ...patchByKey[it._key] } : it)))
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: data?.reply || t('Gotowe.') }])
    } catch (e) {
      let detail = e?.message || String(e)
      try {
        if (e?.context && typeof e.context.json === 'function') {
          const body = await e.context.json()
          if (body?.error) detail = body.error
        }
      } catch { /* zostaje e.message */ }
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: t('Błąd: ') + detail }])
    }
    setAiChatBusy(false)
  }

  // Podwójna weryfikacja — wysyła zdjęcie + nazwę + kod CN każdej pozycji do
  // NIEZALEŻNEGO przebiegu AI (osobna edge function), które ocenia czy
  // rzeczywiście do siebie pasują (łapie np. źle dopasowane zdjęcie po
  // imporcie z Excela).
  const handleVerifyAll = async () => {
    const withPhotos = items.filter(it => it.photo_paths?.length)
    if (!withPhotos.length) { toast.error(t('Żadna pozycja nie ma zdjęcia do zweryfikowania.')); return }
    setVerifyBusy(true)
    try {
      const itemsForApi = []
      for (const it of withPhotos) {
        const urls = []
        for (const p of it.photo_paths.slice(0, 2)) {
          const { signedUrl } = await createSignedUrlWithRetry(p, 3, 500)
          if (signedUrl) urls.push(signedUrl)
        }
        if (urls.length) itemsForApi.push({ key: it._key, name: it.name, specification: it.specification, hs_code: it.hs_code, photo_urls: urls })
      }
      const { data, error } = await supabase.functions.invoke('verify-quote-items', { body: { items: itemsForApi } })
      if (error) throw error
      const results = Array.isArray(data?.results) ? data.results : []
      setVerifyResults(Object.fromEntries(results.map(r => [r.key, r])))
      const problems = results.filter(r => r.ok === false).length
      if (problems > 0) toast.error(t('Znaleziono niespójności w ') + problems + t(' pozycji(ach) — zobacz oznaczenia niżej.'))
      else if (results.length) toast.success(t('Zgodność potwierdzona — zdjęcia pasują do nazw i kodów CN.'))
    } catch (e) {
      let detail = e?.message || String(e)
      try {
        if (e?.context && typeof e.context.json === 'function') {
          const body = await e.context.json()
          if (body?.error) detail = body.error
        }
      } catch { /* zostaje e.message */ }
      toast.error(t('Błąd weryfikacji: ') + detail)
    }
    setVerifyBusy(false)
  }

  // Zdjęcia pozycji wgrywane są do Storage (i dostają wiersz w `documents`,
  // wymagany przez politykę RLS podglądu) OD RAZU przy dodaniu — ale z flagą
  // visible_in_files=false, żeby NIE pojawiały się w zakładce "Pliki
  // projektu" jako draft podczas samego tworzenia wyceny. Dopiero przy
  // JAWNEJ akcji użytkownika (kliknięcie "Zapisz", "Prześlij do zespołu PL"
  // albo "Wyślij do klienta" — NIE przy cichym autozapisie co 1.2s) zdjęcia
  // faktycznie użyte w pozycjach stają się widoczne jako pliki projektu.
  const markPhotosVisibleInFiles = async () => {
    const paths = [...new Set(items.flatMap(it => it.photo_paths || []).filter(Boolean))]
    if (!paths.length) return
    await supabase.from('documents').update({ visible_in_files: true }).in('file_path', paths)
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
      china_customs_clearance_cost: quote.china_customs_clearance_cost === '' || quote.china_customs_clearance_cost === null || quote.china_customs_clearance_cost === undefined ? null : toNum(quote.china_customs_clearance_cost),
      china_customs_clearance_currency: quote.china_customs_clearance_currency || 'PLN',
      china_customs_clearance_rate: quote.china_customs_clearance_rate || null, china_customs_clearance_rate_date: quote.china_customs_clearance_rate_date || null,
      pl_delivery_to_client_cost: quote.pl_delivery_to_client_cost === '' || quote.pl_delivery_to_client_cost === null || quote.pl_delivery_to_client_cost === undefined ? null : toNum(quote.pl_delivery_to_client_cost),
      pl_delivery_currency: quote.pl_delivery_currency || 'PLN',
      pl_delivery_rate: quote.pl_delivery_rate || null, pl_delivery_rate_date: quote.pl_delivery_rate_date || null,
      buyer_name_override: quote.buyer_name_override || null, buyer_address_override: quote.buyer_address_override || null,
      buyer_nip_override: quote.buyer_nip_override || null, buyer_email_override: quote.buyer_email_override || null,
      buyer_phone_override: quote.buyer_phone_override || null,
    }).eq('id', quoteId)
    if (qErr) { setSaving(false); toast.error(t('Nie udało się zapisać wyceny: ') + qErr.message); return false }

    if (deletedIds.length) {
      await supabase.from('quote_items').delete().in('id', deletedIds)
      setDeletedIds([])
    }

    const itemsWithIds = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const payload = {
        quote_id: quoteId, position: i + 1, photo_paths: it.photo_paths || [], photo_path: it.photo_paths?.[0] || null,
        name: it.name || null, specification: it.specification || null,
        qty: toNum(it.qty), unit: it.unit || 'set', unit_price_cny: toNum(it.unit_price_cny),
        unit_price_pln: it.unit_price_pln === '' || it.unit_price_pln === null || it.unit_price_pln === undefined ? null : toNum(it.unit_price_pln),
        cbm: it.cbm === '' || it.cbm === null || it.cbm === undefined ? null : toNum(it.cbm),
        weight_kg: it.weight_kg === '' || it.weight_kg === null || it.weight_kg === undefined ? null : toNum(it.weight_kg),
        container_note: it.container_note || null,
        production_days: it.production_days === '' || it.production_days === null || it.production_days === undefined ? null : toNum(it.production_days),
        hs_code: it.hs_code || null, duty_rate_percent: it.duty_rate_percent === '' || it.duty_rate_percent === null || it.duty_rate_percent === undefined ? null : toNum(it.duty_rate_percent),
        ai_suggestion: it.ai_suggestion || null,
      }
      let id = it.id
      if (it.id) {
        await supabase.from('quote_items').update(payload).eq('id', it.id)
      } else {
        const { data } = await supabase.from('quote_items').insert(payload).select().single()
        // To setItems tylko "dopisuje" id nowo utworzonej pozycji po zapisie —
        // to NIE jest zmiana wprowadzona przez użytkownika, więc nie ma
        // odpalać kolejnego autozapisu (spowodowałoby to zapisywanie w kółko).
        if (data) { id = data.id; skipNextAutosave.current = true; setItems(prev => prev.map(p => p._key === it._key ? { ...p, id: data.id } : p)) }
      }
      itemsWithIds.push({ ...it, id })
    }
    // Tylko przy JAWNYM kliknięciu "Zapisz" (nie przy cichym autozapisie)
    // zdjęcia pozycji stają się widoczne w "Plikach projektu" ORAZ karty w
    // Bazie produktów nadążają za edycją (nazwa/specyfikacja/zdjęcia/kod CN)
    // — nie przy każdym cichym tiku autozapisu co 1.2s.
    if (!silent) {
      await markPhotosVisibleInFiles()
      await syncProductCatalogLinksFor(itemsWithIds)
    }
    setSaving(false)
    if (!silent) toast.success(t('Wycena zapisana ✓'))
    return true
  }

  // Autozapis: cokolwiek zostanie wpisane w polu (nazwa, ilość, notatki...)
  // albo wgrane (zdjęcie, import) ma zostać zapisane samo, bez klikania
  // "Zapisz" — inaczej odświeżenie strony/zamknięcie karty przed ręcznym
  // zapisem gubiło wpisane dane. Debounce 1.2s od ostatniej zmiany.
  useEffect(() => {
    if (loading || !quote) return
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    setAutosaveStatus('pending')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveStatus('saving')
      const ok = await handleSave(true)
      setAutosaveStatus(ok ? 'saved' : 'error')
      if (ok) setTimeout(() => setAutosaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2500)
    }, 1200)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, items])

  const handleSendToPL = async () => {
    if (!items.some(it => it.name && Number(it.qty) > 0)) { toast.error(t('Dodaj przynajmniej jedną pozycję z nazwą i ilością.')); return }
    // Zadanie (widoczne w Dashboard/Moje zadania) dla CAŁEGO zespołu PL
    // przypisanego do tego zamówienia — nie tylko dla jednego "głównego PL".
    // Bierzemy wszystkie przypisania oprócz roli 'glowny_cn' (to jest
    // wyraźnie oznaczona strona chińska — nie ma sensu jej powiadamiać, że
    // sama właśnie przekazała wycenę dalej). Brak generycznej tabeli
    // powiadomień w aplikacji, więc zadanie w centrum zadań pełni tę rolę —
    // sprawdzamy to PRZED zmianą statusu: jeśli nie ma komu przypisać
    // zadania, przekazanie ma się nie udać z czytelnym błędem, a nie po
    // cichu "zniknąć" bez żadnego powiadomienia (tak było wcześniej).
    const { data: assignments, error: assignErr } = await supabase.from('project_assignments')
      .select('user_id, role').eq('project_id', quote.project_id).neq('role', 'glowny_cn')
    if (assignErr) { toast.error(t('Nie udało się sprawdzić zespołu PL zamówienia: ') + assignErr.message); return }
    const plUserIds = [...new Set((assignments || []).map(a => a.user_id).filter(Boolean))]
    if (!plUserIds.length) {
      toast.error(t('To zamówienie nie ma jeszcze przypisanego nikogo z zespołu PL — przypisz opiekuna w panelu Projekty & Zamówienia, dopiero potem przekaż wycenę do zespołu PL.'))
      return
    }
    const ok = await handleSave(true)
    if (!ok) return
    const { error } = await supabase.from('quotes').update({ status: 'do_marzy_pl' }).eq('id', quoteId)
    if (error) { toast.error(t('Nie udało się przesłać: ') + error.message); return }
    await markPhotosVisibleInFiles()
    // Karty w Bazie produktów (Magazyn) mają istnieć od razu, jak tylko
    // zespół chiński skończy wycenę i przekaże ją dalej — nie dopiero po
    // wysłaniu do klienta (to mogło być tygodnie później). Najlepszy
    // wysiłek: błąd synchronizacji katalogu nie ma blokować przekazania.
    await syncProductCatalogLinksFor(items)
    let taskFailCount = 0
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Jeśli ktoś z zespołu PL ma już OTWARTE (nieukończone) zadanie dla
      // TEJ SAMEJ wyceny (np. przycisk kliknięty drugi raz, albo wycena
      // wcześniej trafiła tu przez import Excela — patrz quoteIntake.js),
      // tylko odśwież termin/opis zamiast tworzyć duplikat w Centrum zadań.
      const { data: existingTasks } = await supabase.from('tasks')
        .select('id, assigned_to, status').eq('quote_id', quote.id).in('assigned_to', plUserIds)
      const openByUser = new Map((existingTasks || []).filter(t => t.status !== 'done').map(t => [t.assigned_to, t]))
      const title = `Dodaj marżę i wyślij wycenę ${quote.quote_number} do klienta`
      const description = `Zespół chiński przekazał wycenę ${quote.quote_number}${client?.name ? ' (' + client.name + ')' : ''} — dodaj transport, marżę i VAT, sprawdź kursy NBP i wyślij do klienta.`
      const todayStr = new Date().toISOString().slice(0, 10)
      const toInsert = plUserIds.filter(uid => !openByUser.has(uid))
      const toUpdate = plUserIds.filter(uid => openByUser.has(uid))
      const [insertRes, updateResArr] = await Promise.all([
        toInsert.length
          ? supabase.from('tasks').insert(toInsert.map(uid => ({
              title, description, project_id: quote.project_id, client_id: quote.client_id, quote_id: quote.id,
              assigned_to: uid, assigned_by: user?.id, due_date: todayStr, status: 'todo', priority: 'pilne',
            })))
          : Promise.resolve({ error: null }),
        Promise.all(toUpdate.map(uid => supabase.from('tasks').update({ title, description, due_date: todayStr }).eq('id', openByUser.get(uid).id))),
      ])
      taskFailCount = (insertRes.error ? toInsert.length : 0) + updateResArr.filter(r => r.error).length
    } catch {
      taskFailCount = plUserIds.length
    }
    if (taskFailCount) {
      // Status wyceny już zmieniony (nie chcemy tego cofać) — ale zgłaszamy
      // wyraźnie, że część/wszystkie zadania się nie utworzyły, zamiast milczeć.
      toast.error(t(`Wycena przekazana, ale nie udało się utworzyć zadania dla ${taskFailCount} z ${plUserIds.length} osób zespołu PL — poinformuj ich ręcznie.`))
      load(); onChanged && onChanged()
      return
    }
    toast.success(t(`Przesłano do zespołu PL (${plUserIds.length} ${plUserIds.length === 1 ? 'osoba' : 'osoby/osób'}) — teraz można doliczyć transport, cło i marżę.`))
    load(); onChanged && onChanged()
  }

  // Buduje mapę _key -> [data:URL, data:URL, ...] zdjęć pozycji (jedno lub
  // więcej), do osadzenia w pliku Excel dla klienta (exceljs potrzebuje
  // danych obrazka jako base64, nie samego URL-a). Pierwsze zdjęcie =
  // okładka pozycji (ta trafia do kolumny "Zdjęcie" w Excelu).
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
        } catch { /* brak jednego ze zdjęć w dokumencie, nie blokujemy wysyłki/podglądu */ }
      }
      if (urls.length) photoDataUrls[it._key] = urls
      // Jeśli pozycja MIAŁA zdjęcia, ale żadne się nie wczytało — to nie
      // powinno być ciche. Wcześniej brak zdjęcia w dokumencie nie był w
      // ogóle sygnalizowany, więc wyglądało to jak "losowo jednego zdjęcia
      // nie widać" bez wyjaśnienia dlaczego.
      else failedItems.push(it.name || t('pozycja bez nazwy'))
    }
    if (failedItems.length) {
      toast.error(t('Nie udało się wczytać zdjęć dla: ') + failedItems.join(', ') + t(' — sprawdź połączenie i spróbuj ponownie.'))
    }
    return photoDataUrls
  }

  // Podgląd pliku Excel PRZED wysłaniem do klienta — generuje dokładnie ten
  // sam plik, który powstanie przy "Wyślij do klienta" (te same dane z
  // formularza), ale nic nie zapisuje/wysyła — tylko otwiera go do podejrzenia
  // w nowej karcie i zostawia trwały link do pobrania na tej stronie.
  const handlePreviewExcel = async () => {
    const win = window.open('', '_blank')
    setSending('preview')
    try {
      const photoDataUrls = await buildPhotoDataUrls()
      const blob = await exportQuoteToExcelBlob({
        quote, client, contact, company, rows: totalsCalc.rows, totals: totalsCalc.totals,
        photoDataUrls, logoDataUrl: logoNavyDataUrl, notes: quote?.notes || '',
      })
      const url = URL.createObjectURL(blob)
      setPreviewExcelUrl(url)
      if (win) win.location.href = url
      else window.open(url, '_blank')
      toast.success(t('Podgląd Excela wygenerowany ✓ Jeśli karta się nie otworzyła, użyj linku „Pobierz wygenerowany Excel” poniżej.'))
    } catch (e) {
      if (win) win.close()
      toast.error(t('Nie udało się wygenerować podglądu: ') + (e.message || e))
    }
    setSending(false)
  }

  // Kartoteka produktów (Magazyn) — każda WYSŁANA wycena automatycznie
  // "odkłada" swoje pozycje jako karty produktów, żeby przy kolejnej podobnej
  // wycenie/fakturze można było je znaleźć w Magazynie bez przepisywania od
  // zera. Dopisujemy TYLKO pozycje, których nazwa jeszcze nie istnieje w
  // katalogu (dopasowanie po nazwie, bez rozróżniania wielkości liter) — nie
  // nadpisujemy istniejących, ręcznie skompletowanych kart (stany, ceny
  // sprzedaży itd. mogą być tam już starannie ustawione). Najlepszy wysiłek:
  // błąd synchronizacji katalogu nigdy nie blokuje wysłania wyceny do klienta.
  // Zdjęcie kopiowane jest z prywatnego bucketu 'dokumenty' (gdzie leżą
  // zdjęcia pozycji wyceny) do publicznego 'produkty' (którego oczekuje
  // Kartoteka towarów w Magazynie) — patrz productCatalog.js.
  // Wersja z TRWAŁYM powiązaniem (quote_items.product_id) — pierwsza
  // synchronizacja tworzy/dopasowuje kartę, każda kolejna (np. przy Zapisz,
  // Prześlij do PL, Wyślij do klienta) aktualizuje TĘ SAMĄ kartę zamiast
  // tworzyć nowe, nawet jeśli nazwa pozycji się zmieni. Synchronizowane są
  // tylko dane katalogowe (nazwa/specyfikacja/zdjęcia/kod CN/cło) — ceny i
  // marże celowo zostają wyłącznie w wycenie.
  const syncProductCatalogLinksFor = async (itemsList) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const newLinks = await syncQuoteItemsWithCatalog(itemsList, { quoteNumber: quote.quote_number || quoteId, company: 'PL', userId: user?.id || null })
      if (newLinks.length) {
        await Promise.all(newLinks.map(({ itemId, product_id }) => supabase.from('quote_items').update({ product_id }).eq('id', itemId)))
        skipNextAutosave.current = true
        setItems(prev => prev.map(p => {
          const link = newLinks.find(l => l.itemId === p.id)
          return link ? { ...p, product_id: link.product_id } : p
        }))
      }
    } catch {
      // Katalog produktów to funkcja pomocnicza — jej błąd nie ma prawa
      // przerwać wysyłki wyceny do klienta.
    }
  }

  const handleSendToClient = async () => {
    if (quote.margin_percent === null || quote.margin_percent === undefined || quote.margin_percent === '') {
      toast.error(t('Wpisz marżę przed wysłaniem do klienta.')); return
    }
    if (!quote.nbp_rate) { toast.error(t('Pobierz kurs NBP dla towaru (CNY) przed wysłaniem do klienta.')); return }
    if ((quote.transport_currency || 'CNY') !== 'PLN' && Number(quote.transport_cost) > 0 && !quote.transport_rate) {
      toast.error(t('Pobierz kurs NBP dla waluty transportu przed wysłaniem do klienta.')); return
    }
    if ((quote.china_customs_clearance_currency || 'PLN') !== 'PLN' && Number(quote.china_customs_clearance_cost) > 0 && !quote.china_customs_clearance_rate) {
      toast.error(t('Pobierz kurs NBP dla waluty odprawy celnej (Chiny) przed wysłaniem do klienta.')); return
    }
    if ((quote.pl_delivery_currency || 'PLN') !== 'PLN' && Number(quote.pl_delivery_to_client_cost) > 0 && !quote.pl_delivery_rate) {
      toast.error(t('Pobierz kurs NBP dla waluty dostawy do klienta przed wysłaniem do klienta.')); return
    }
    const confirmMsg = quote.status === 'wyslana'
      ? t('Wysłać poprawioną wersję tej wyceny do klienta? Nadpisze poprzedni plik Excel (ten sam numer wyceny) nowymi danymi.')
      : t('Wysłać tę wycenę do klienta? Wygeneruje się plik Excel z ceną końcową netto/VAT/brutto w PLN i automatycznie odblokuje 2. etap zamówienia.')
    if (!await confirm(confirmMsg)) return
    const ok = await handleSave(true)
    if (!ok) return
    setSending(true)
    try {
      // Klient dostaje wycenę jako plik EXCEL (nie PDF) — decyzja z zadania
      // #219: klasyczna tabela pozycji ze zdjęciami, które klient może sam
      // ręcznie powiększyć w Excelu. Stary PDF zostaje na razie tylko jako
      // wewnętrzny podgląd (przycisk "Podgląd PDF" wyżej) — jego pełne
      // usunięcie to osobne zadanie #220.
      const photoDataUrls = await buildPhotoDataUrls()
      const blob = await exportQuoteToExcelBlob({
        quote, client, contact, company, rows: totalsCalc.rows, totals: totalsCalc.totals,
        photoDataUrls, logoDataUrl: logoNavyDataUrl, notes: quote?.notes || '',
      })
      const excelPath = `${quote.client_id}/wycena-${quote.quote_number || quoteId}.xlsx`
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(excelPath, blob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const excelFileName = `${quote.quote_number || 'wycena'}.xlsx`
      const { data: existingDoc } = await supabase.from('documents').select('id').eq('file_path', excelPath).maybeSingle()
      if (existingDoc?.id) {
        await supabase.from('documents').update({ uploaded_by: user?.id, created_at: new Date().toISOString() }).eq('id', existingDoc.id)
      } else {
        await supabase.from('documents').insert({
          client_id: quote.client_id, project_id: quote.project_id,
          category: 'Wycena', file_path: excelPath, file_name: excelFileName,
          uploaded_by: user?.id, source: 'manual',
        })
      }
      const { error: sendErr } = await supabase.from('quotes').update({ status: 'wyslana', sent_at: new Date().toISOString(), client_excel_path: excelPath }).eq('id', quoteId)
      if (sendErr) throw sendErr
      await markPhotosVisibleInFiles()
      await syncProductCatalogLinksFor(items)
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

  // Pobranie ostatnio wysłanego pliku EXCEL (to, co faktycznie poszło do
  // klienta od momentu wdrożenia zadania #219). Starsze wyceny, wysłane
  // jeszcze przed tą zmianą, mają tylko quote.pdf_path — dla nich pokazujemy
  // legacy przycisk PDF (handleDownloadPdf) zamiast tego.
  const handleDownloadExcel = async () => {
    if (!quote.client_excel_path) { toast.error(t('Brak wygenerowanego pliku Excel.')); return }
    const win = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(quote.client_excel_path, 300)
    if (error) { if (win) win.close(); toast.error(t('Nie udało się pobrać pliku Excel: ') + error.message); return }
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
        {autosaveStatus !== 'idle' && (
          <span style={{ fontSize: 10.5, color: autosaveStatus === 'error' ? C.red : C.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {autosaveStatus === 'pending' && t('Wpisywanie…')}
            {autosaveStatus === 'saving' && t('Zapisywanie…')}
            {autosaveStatus === 'saved' && t('✓ Zapisano automatycznie')}
            {autosaveStatus === 'error' && t('⚠ Nie udało się zapisać automatycznie')}
          </span>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted }}>{client?.name} · {project?.order_label}</div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>📦 {t("Pozycje towaru (zespół chiński — cena fabryczna EXW)")}</div>
        {items.map((it) => (
          <div key={it._key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 168, flexShrink: 0 }}>
                <label style={label}>{t(`Zdjęcia (do ${MAX_PHOTOS_PER_ITEM}, przeciągnij żeby zmienić kolejność albo przenieść do innej pozycji — pierwsze = okładka)`)}</label>
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    // Upuszczenie na PUSTYM tle listy (nie na konkretnym zdjęciu, nie
                    // na pliku z dysku) — trafia tu głównie wtedy, gdy pozycja nie ma
                    // jeszcze ŻADNEGO zdjęcia (import z Excela "rozjechał" dopasowanie
                    // i ta pozycja została bez zdjęcia) — dopisujemy przeciągane na koniec.
                    if (e.dataTransfer.files?.length) return
                    e.preventDefault()
                    const dragged = draggedPhoto.current
                    if (dragged) movePhoto(dragged.key, dragged.path, it._key, null)
                    draggedPhoto.current = null
                  }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 78 }}>
                  {(it.photo_paths || []).map((p, pi) => (
                    <div key={p}
                      draggable
                      onDragStart={() => { draggedPhoto.current = { key: it._key, path: p } }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault()
                        const dragged = draggedPhoto.current
                        if (dragged) movePhoto(dragged.key, dragged.path, it._key, p)
                        draggedPhoto.current = null
                      }}
                      onDragEnd={() => { draggedPhoto.current = null }}
                      title={t('Przeciągnij, żeby zmienić kolejność albo przenieść do innej pozycji')}
                      style={{ width: 78, height: 78, borderRadius: 9, overflow: 'hidden', position: 'relative', border: `1px solid ${C.border}`, background: C.white, cursor: 'grab' }}>
                      <img src={photoUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
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
                      onDrop={e => {
                        e.preventDefault()
                        const f = e.dataTransfer.files?.[0]
                        if (f) { handleAddPhoto(it._key, f); return }
                        const dragged = draggedPhoto.current
                        if (dragged) movePhoto(dragged.key, dragged.path, it._key, null)
                        draggedPhoto.current = null
                      }}
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
              <div>
                <label style={label}>{t("Cena EXW (CNY/szt.)")}</label>
                <input type="text" inputMode="decimal" style={field} value={it.unit_price_cny} onChange={e => setItem(it._key, { unit_price_cny: e.target.value })} />
                {/* Cena PLN/szt. dla zespołu PL — pod ceną CNY: auto-przeliczona
                    wg kursu NBP + prowizji (ten sam kurs co w panelu "Transport,
                    cło i marża" niżej), ale można ją ręcznie podbić — różnica
                    między tym co wpisano a auto-przeliczeniem to marża TEJ
                    pozycji. Bez ręcznej wartości pozycja liczy się jak dotąd,
                    globalną marżą % z panelu niżej (patrz calc.js). */}
                {(() => {
                  const suggestedPln = toNum(it.unit_price_cny) * cnyRateEff
                  const hasManualPln = it.unit_price_pln !== null && it.unit_price_pln !== undefined && it.unit_price_pln !== ''
                  const unitPln = hasManualPln ? toNum(it.unit_price_pln) : suggestedPln
                  const marginPerUnit = hasManualPln ? unitPln - suggestedPln : 0
                  const marginPercent = hasManualPln && suggestedPln > 0 ? (marginPerUnit / suggestedPln) * 100 : 0
                  const lineTotalPln = toNum(it.qty) * unitPln
                  return (
                    <div style={{ marginTop: 6 }}>
                      <label style={{ ...label, marginBottom: 2 }}>{t("Cena PLN/szt. (zespół PL)")}</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="text" inputMode="decimal" style={field}
                          value={it.unit_price_pln ?? ''} placeholder={fmt(suggestedPln, 2)}
                          onChange={e => setItem(it._key, { unit_price_pln: e.target.value })} />
                        {hasManualPln && (
                          <button type="button" onClick={() => setItem(it._key, { unit_price_pln: null })}
                            title={t('Wróć do automatycznego przeliczenia wg kursu')}
                            style={{ padding: '0 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.muted, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>↺</button>
                        )}
                      </div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                        {hasManualPln
                          ? t(`Marża: ${fmt(marginPerUnit, 2)} PLN/szt. (${fmt(marginPercent, 1)}%) · Razem: ${fmt(lineTotalPln, 2)} PLN`)
                          : t(`Auto wg kursu (bez marży ręcznej) · Razem: ${fmt(lineTotalPln, 2)} PLN`)}
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div><label style={label}>{t("CBM (m³)")}</label><input type="text" inputMode="decimal" style={field} value={it.cbm} onChange={e => setItem(it._key, { cbm: e.target.value })} /></div>
              <div><label style={label}>{t("Waga (kg)")}</label><input type="text" inputMode="decimal" style={field} value={it.weight_kg} onChange={e => setItem(it._key, { weight_kg: e.target.value })} /></div>
              <div><label style={label}>{t("Kontener (opc.)")}</label><input style={field} value={it.container_note} onChange={e => setItem(it._key, { container_note: e.target.value })} placeholder="2*40HQ" /></div>
              <div><label style={label}>{t("Czas produkcji (dni)")}</label><input type="text" inputMode="decimal" style={field} value={it.production_days} onChange={e => setItem(it._key, { production_days: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr auto auto', gap: 8, marginTop: 10, alignItems: 'end' }}>
              <div><label style={label}>{t("Kod CN (10 cyfr)")}</label><input style={field} value={it.hs_code} onChange={e => setItem(it._key, { hs_code: e.target.value })} placeholder="9403300090" /></div>
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

            {/* Status weryfikacji w prawdziwym rejestrze ISZTAR4 — pochodzi z
                edge function suggest-customs-code (v3), która po wytypowaniu
                kodu przez AI sprawdza go w prawdziwym API rządowym. To TYLKO
                informacja pomocnicza — link "Zweryfikuj w ISZTAR ↗" wyżej
                zawsze zostaje do ręcznego podwójnego sprawdzenia. */}
            {it.ai_suggestion?.verified === true && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.glight, color: C.green }}>
                  {t("✓ Zweryfikowano w ISZTAR")}
                </span>
                {it.ai_suggestion?.regulation_link && (
                  <a href={it.ai_suggestion.regulation_link} target="_blank" rel="noreferrer" style={{ fontSize: 9.5, color: C.blue, textDecoration: 'underline' }}>{t("Regulacja celna ↗")}</a>
                )}
                {it.ai_suggestion?.vat_rate_percent !== undefined && it.ai_suggestion?.vat_rate_percent !== null && (
                  <span style={{ fontSize: 9.5, color: C.muted }}>{t("VAT wg ISZTAR:")} {it.ai_suggestion.vat_rate_percent}%</span>
                )}
              </div>
            )}
            {it.ai_suggestion && it.ai_suggestion.verified === false && (
              <div style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.olight, color: C.orange, display: 'inline-block', marginTop: 6 }}>
                {t("⚠ Kod niezweryfikowany w ISZTAR — sprawdź ręcznie i potwierdź stawkę cła przed wysyłką")}
              </div>
            )}
            {it.ai_suggestion?.china_specific_note && (
              <div style={{ fontSize: 10, color: C.red, marginTop: 4, fontWeight: 600 }}>
                ⚠ {it.ai_suggestion.china_specific_note}
              </div>
            )}
            {Array.isArray(it.ai_suggestion?.nontariff_warnings) && it.ai_suggestion.nontariff_warnings.length > 0 && (
              <div style={{ fontSize: 9.5, color: C.orange, marginTop: 2 }}>
                {t("Ograniczenia pozataryfowe:")} {it.ai_suggestion.nontariff_warnings.join('; ')}
              </div>
            )}
            {it.hs_code && describeHsCode(it.hs_code) && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {t("Dział")} {String(it.hs_code).replace(/\D/g, '').slice(0, 2)}: <strong>{t(describeHsCode(it.hs_code))}</strong> {t("(orientacyjnie, wg pierwszych cyfr kodu — zawsze zweryfikuj dokładny kod w ISZTAR)")}
              </div>
            )}

            {/* Wynik podwójnej weryfikacji (edge function verify-quote-items)
                — czy zdjęcie realnie pasuje do nazwy/specyfikacji/kodu CN.
                Niezależny przebieg AI od suggest-customs-code powyżej. */}
            {verifyResults[it._key]?.ok === true && (
              <div style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.glight, color: C.green, display: 'inline-block', marginTop: 6 }}>
                {t("✓ Zdjęcie zgodne z nazwą i kodem CN")}
              </div>
            )}
            {verifyResults[it._key]?.ok === false && (
              <div style={{ fontSize: 10, color: C.red, marginTop: 6, fontWeight: 600 }}>
                ⚠ {t("Niespójność zdjęcia/nazwy/kodu:")} {(verifyResults[it._key].issues || []).join('; ')}
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
          <button onClick={() => setAiChatOpen(true)}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.purple}`, background: C.plight, color: C.purple, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            🧠 {t("Asystent AI (edytuj poleceniem)")}
          </button>
          <button onClick={handleVerifyAll} disabled={verifyBusy}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.green}`, background: C.glight, color: C.green, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: verifyBusy ? .6 : 1 }}>
            {verifyBusy ? t('Weryfikuję…') : `🔍 ${t("Zweryfikuj zdjęcia/kody (podwójna kontrola)")}`}
          </button>
          <div style={{ fontSize: 9.5, color: C.muted, alignSelf: 'center' }}>{t("Rozpozna kolumny typu Name/Specification/QTY/EXW Unit Price/Volume — resztę uzupełnisz ręcznie.")}</div>
        </div>
      </div>

      {excelPreviewRows && (
        <ExcelImportPreview
          rows={excelPreviewRows}
          fileName={excelPreviewFileName}
          onCancel={handleCancelExcelPreview}
          onConfirm={handleConfirmExcelImport}
        />
      )}

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

      {/* Asystent AI wyceny — czat korekcyjny: dowolne polecenie stosowane od
          razu do całej listy pozycji (edge function quote-ai-assistant),
          np. "zwiększ ilość wszystkich o 10%" albo "usuń pozycje z fotelami". */}
      {aiChatOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !aiChatBusy && setAiChatOpen(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 24, width: 520, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🧠 {t("Asystent AI wyceny")}</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              {t("Napisz polecenie po polsku dotyczące całej wyceny naraz — np. \"zwiększ ilość wszystkich pozycji o 10%\", \"zmień jednostkę drugiej pozycji na kg\", \"usuń pozycje z fotelami\". Możesz też po prostu o coś zapytać.")}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 120, maxHeight: 320, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiChatMessages.length === 0 && (
                <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{t("Brak wiadomości — napisz pierwsze polecenie poniżej.")}</div>
              )}
              {aiChatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <div style={{
                    background: m.role === 'user' ? C.purple : C.bg, color: m.role === 'user' ? '#fff' : C.text,
                    borderRadius: 10, padding: '8px 12px', fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre-wrap',
                  }}>{m.text}</div>
                </div>
              ))}
              {aiChatBusy && <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{t("Analizuję…")}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={aiChatInput} onChange={e => setAiChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiChatSend() } }}
                placeholder={t("np. zwiększ ilość wszystkich pozycji o 10%")} disabled={aiChatBusy}
                style={{ ...field, flex: 1 }} />
              <button onClick={handleAiChatSend} disabled={aiChatBusy || !aiChatInput.trim()}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (aiChatBusy || !aiChatInput.trim()) ? .6 : 1 }}>
                {t("Wyślij")}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setAiChatOpen(false)} style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{t("Zamknij")}</button>
            </div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={sectionTitle}>💰 {t("Koszty i marża (zespół polski)")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, marginBottom: 10 }}>
          <div><label style={label}>{t("Szacowany transport (do Polski)")}</label><input type="text" inputMode="decimal" style={field} value={quote.transport_cost || ''} onChange={e => setQ({ transport_cost: e.target.value })} /></div>
          <div><label style={label}>{t("Waluta transportu")}</label>
            <select style={field} value={quote.transport_currency || 'CNY'} onChange={e => handleTransportCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>{t("Marża (%)")}</label>
            <input type="text" inputMode="decimal" style={field} value={quote.margin_percent ?? ''} onChange={e => handleMarginChange(e.target.value)} placeholder="np. 30" />
          </div>
          <div><label style={label}>{t("Ważna do")}</label><input type="date" style={field} value={quote.valid_until || ''} onChange={e => setQ({ valid_until: e.target.value })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <div><label style={label}>{t("Odprawa celna (Chiny)")}</label><input type="text" inputMode="decimal" style={field} value={quote.china_customs_clearance_cost ?? ''} onChange={e => setQ({ china_customs_clearance_cost: e.target.value })} /></div>
          <div><label style={label}>{t("Waluta odprawy (Chiny)")}</label>
            <select style={field} value={quote.china_customs_clearance_currency || 'PLN'} onChange={e => handleChinaCustomsCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label style={label}>{t("Dostawa do klienta (Polska)")}</label><input type="text" inputMode="decimal" style={field} value={quote.pl_delivery_to_client_cost ?? ''} onChange={e => setQ({ pl_delivery_to_client_cost: e.target.value })} /></div>
          <div><label style={label}>{t("Waluta dostawy (Polska)")}</label>
            <select style={field} value={quote.pl_delivery_currency || 'PLN'} onChange={e => handlePlDeliveryCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
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
                {['Pozycja', 'Towar', 'Transport (udział)', 'Wart. celna', 'Cło', 'Odprawa+dostawa (udział)', 'Koszt razem', 'Cena dla klienta netto (PLN)'].map(h => (
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
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>{fmt(r.extraCostsShare, 2)}</td>
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
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.extraCostsShare, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalsCalc.totals.landedCost, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: C.blue, fontSize: 13 }}>{fmt(totalsCalc.totals.finalPrice, 2)} PLN</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Ten rozkład (marża, cło, koszt towaru osobno) widzi tylko zespół wewnętrzny. Towar jest w cenie fabrycznej CNY, pozostałe koszty w walutach wybranych wyżej — wszystkie są tu już przeliczone na złotówki wg kursów NBP poniżej. Do klienta trafia wyłącznie cena końcowa netto/VAT/brutto w PLN.")}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, alignItems: 'end', marginBottom: 14 }}>
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
        {(quote.china_customs_clearance_currency || 'PLN') !== 'PLN' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, alignItems: 'end', marginBottom: 14 }}>
            <div>
              <label style={label}>{t(`Kurs średni NBP (${quote.china_customs_clearance_currency}→PLN, odprawa CN)`)}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>
                {quote.china_customs_clearance_rate ? `${quote.china_customs_clearance_rate} ${t("z dnia")} ${quote.china_customs_clearance_rate_date}` : t("— nie pobrano —")}
              </div>
            </div>
            <div>
              <button onClick={handleFetchChinaCustomsRate} disabled={fetchingChinaCustomsRate}
                style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: fetchingChinaCustomsRate ? .6 : 1 }}>
                {fetchingChinaCustomsRate ? t('Pobieranie…') : t(`🔄 Odśwież kurs ${quote.china_customs_clearance_currency}`)}
              </button>
            </div>
            <div>
              <label style={label}>{t("Kurs efektywny (odprawa CN)")}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>{chinaCustomsClearanceRateEff ? fmt(chinaCustomsClearanceRateEff, 4) : '—'}</div>
            </div>
            <div />
          </div>
        )}
        {(quote.pl_delivery_currency || 'PLN') !== 'PLN' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={label}>{t(`Kurs średni NBP (${quote.pl_delivery_currency}→PLN, dostawa PL)`)}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>
                {quote.pl_delivery_rate ? `${quote.pl_delivery_rate} ${t("z dnia")} ${quote.pl_delivery_rate_date}` : t("— nie pobrano —")}
              </div>
            </div>
            <div>
              <button onClick={handleFetchPlDeliveryRate} disabled={fetchingPlDeliveryRate}
                style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: fetchingPlDeliveryRate ? .6 : 1 }}>
                {fetchingPlDeliveryRate ? t('Pobieranie…') : t(`🔄 Odśwież kurs ${quote.pl_delivery_currency}`)}
              </button>
            </div>
            <div>
              <label style={label}>{t("Kurs efektywny (dostawa PL)")}</label>
              <div style={{ ...field, background: C.bg, fontWeight: 700 }}>{plDeliveryRateEff ? fmt(plDeliveryRateEff, 4) : '—'}</div>
            </div>
            <div />
          </div>
        )}
        <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t("Kursy zapisują się na wycenie w momencie zapisu/wysyłki — nie zmieniają się już potem samoczynnie. BNP Paribas nie udostępnia publicznego API, dlatego bazujemy na oficjalnym kursie średnim NBP i doliczamy prowizję banku ręcznie.")}</div>
      </div>

      {(() => {
        const tCur = quote.transport_currency || 'CNY'
        const ccCur = quote.china_customs_clearance_currency || 'PLN'
        const plCur = quote.pl_delivery_currency || 'PLN'
        const marginAmount = totalsCalc.totals.finalPrice - totalsCalc.totals.landedCost
        const steps = [
          { label: t('Kurs towaru (NBP + prowizja banku)'), calc: `1 CNY = ${fmt(quote.nbp_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(cnyRateEff, 4)} PLN` },
          { label: t('Wartość towaru'), calc: t('suma: ilość × cena EXW × kurs, dla wszystkich pozycji'), value: `${fmt(totalsCalc.totals.goodsValue, 2)} PLN` },
          ...(tCur !== 'PLN' ? [{ label: t(`Kurs transportu (${tCur})`), calc: `1 ${tCur} = ${fmt(quote.transport_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(transportRateEff, 4)} PLN` }] : []),
          { label: t('Transport'), calc: `${fmt(toNum(quote.transport_cost), 2)} ${tCur} × ${fmt(transportRateEff, 4)}`, value: `${fmt(totalsCalc.totals.transportShare, 2)} PLN` },
          { label: t('Wartość celna (towar + transport)'), calc: t('wartość towaru + transport'), value: `${fmt(totalsCalc.totals.customsValue, 2)} PLN` },
          { label: t('Cło'), calc: t('wartość celna × stawka cła każdej pozycji'), value: `${fmt(totalsCalc.totals.dutyAmount, 2)} PLN` },
          ...(toNum(quote.china_customs_clearance_cost) > 0 ? [
            ...(ccCur !== 'PLN' ? [{ label: t(`Kurs odprawy celnej (${ccCur})`), calc: `1 ${ccCur} = ${fmt(quote.china_customs_clearance_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(chinaCustomsClearanceRateEff, 4)} PLN` }] : []),
            { label: t('Odprawa celna (Chiny)'), calc: `${fmt(toNum(quote.china_customs_clearance_cost), 2)} ${ccCur} × ${fmt(chinaCustomsClearanceRateEff, 4)}`, value: `${fmt(totalsCalc.totals.chinaCustomsClearancePln, 2)} PLN` },
          ] : []),
          ...(toNum(quote.pl_delivery_to_client_cost) > 0 ? [
            ...(plCur !== 'PLN' ? [{ label: t(`Kurs dostawy do klienta (${plCur})`), calc: `1 ${plCur} = ${fmt(quote.pl_delivery_rate || 0, 4)} × (1 + ${fmt(quote.bank_commission_percent || 0, 2)}%)`, value: `${fmt(plDeliveryRateEff, 4)} PLN` }] : []),
            { label: t('Dostawa do klienta (Polska)'), calc: `${fmt(toNum(quote.pl_delivery_to_client_cost), 2)} ${plCur} × ${fmt(plDeliveryRateEff, 4)}`, value: `${fmt(totalsCalc.totals.plDeliveryPln, 2)} PLN` },
          ] : []),
          { label: t('Koszt razem (bez marży)'), calc: t('wartość celna + cło + odprawa celna (Chiny) + dostawa do klienta (Polska)'), value: `${fmt(totalsCalc.totals.landedCost, 2)} PLN` },
          {
            label: t(`Marża (${fmt(effectiveMarginPct, 1)}% efektywnie)`),
            calc: hasAnyManualPln
              ? t('część pozycji ma ręczną cenę PLN/szt. (nie liczoną z marży globalnej) — to efektywna różnica dla całej wyceny')
              : t('koszt razem × marża%'),
            value: `${fmt(marginAmount, 2)} PLN`, highlight: true,
          },
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
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.orange, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t(`Netto (z marżą ${fmt(effectiveMarginPct, 1)}% efektywnie)`)}</div>
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
          {' · '}{t("Całkowita objętość zamówienia:")} <strong>{fmt(totalsCalc.totals.totalCbm, 2)} m³</strong>
          {' · '}{t("Cena bazowa towaru od zespołu chińskiego (pomocniczo):")} <strong>{fmt(totalsCalc.totals.goodsValue && cnyRateEff ? totalsCalc.totals.goodsValue / cnyRateEff : 0, 2)} CNY</strong>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>👁 {t("Podgląd Excela (dokładnie to trafi do klienta — edytuj bezpośrednio poniżej)")}</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 12 }}>
          {t("To jest żywy podgląd tego samego pliku, który wyślesz klientowi — edycja tu (nazwa/specyfikacja, cena netto/szt., dane nabywcy, Warunki) zapisuje się wprost do wyceny, tak jak formularz wyżej. Zdjęcie każdej pozycji możesz tu przeciągnąć na inną — przydatne, gdy import z Excela pomylił dopasowanie. Ilość edytujesz w sekcji „Pozycje towaru” powyżej.")}
        </div>
        <ExcelLivePreview
          quote={quote} client={client} contact={contact} company={company}
          rows={totalsCalc.rows} totals={totalsCalc.totals}
          photoUrl={photoUrl} logoDataUrl={logoNavyDataUrl}
          onChangeItem={setItem} onChangeNotes={(notes) => setQ({ notes })}
          onChangeQuote={(patch) => setQ(patch)}
          draggedPhoto={draggedPhoto} movePhoto={movePhoto}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2, opacity: saving ? .6 : 1 }}>
          {saving ? t("Zapisywanie…") : t("💾 Zapisz")}
        </button>
        <button onClick={handlePreviewExcel} disabled={!!sending}
          style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #B48C28, #E4C158)', color: '#0A1628', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: sending ? .7 : 1, boxShadow: '0 3px 12px rgba(180,140,40,0.45)' }}>
          {sending === 'preview' ? t("Generowanie…") : t("👁 Podgląd Excela")}
        </button>
        {previewExcelUrl && (
          <a href={previewExcelUrl} target="_blank" rel="noreferrer" download={`podglad-${quote.quote_number || 'wycena'}.xlsx`}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.bmid}`, background: C.blight, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.blue, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ⬇ {t("Pobierz wygenerowany Excel")}
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
        {quote.status === 'wyslana' && quote.client_excel_path && (
          <button onClick={handleDownloadExcel} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2 }}>{t("📥 Pobierz ostatnio wysłany Excel")}</button>
        )}
        {quote.status === 'wyslana' && !quote.client_excel_path && quote.pdf_path && (
          <button onClick={handleDownloadPdf} style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text2 }}>{t("Pobierz ostatnio wysłany PDF (starsza wycena)")}</button>
        )}
      </div>
    </div>
  )
}
