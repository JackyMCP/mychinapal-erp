import { supabase } from './supabaseClient'
import { isFileTooBig } from './files'
import { parseQuoteExcel } from '../components/wyceny/excelImport'
import { nextQuoteNumber } from '../components/wyceny/calc'

// Nowa koncepcja wycen: zespół CN nie wypełnia już ręcznie formularza w
// aplikacji — dostarcza gotowy plik Excel z wyceną (pozycje towaru, ceny,
// zdjęcia). Może to zrobić na TRZY niezależne sposoby, każdy z nich
// wywołuje DOKŁADNIE tę samą funkcję poniżej, więc efekt końcowy jest
// zawsze identyczny:
//   1. wgranie pliku w panelu zamówienia (Pliki projektu) z kategorią "Wycena"
//   2. wysłanie pliku na czacie zamówienia z przypisaniem kategorii "Wycena"
//   3. wgranie pliku wprost w zakładce Wyceny ("Wgraj wycenę od zespołu CN")
//
// Efekt: plik zostaje sparsowany (te same reguły co dotychczasowy ręczny
// import Excela), powstaje nowa wycena (status 'do_marzy_pl' — zespół CN
// swoją część już zrobił) z pozycjami i zdjęciami, a CAŁY zespół PL
// przypisany do zamówienia dostaje zadanie w Centrum zadań — dokładnie jak
// dawniej przy ręcznym kliknięciu "Prześlij do zespołu PL".
function isExcelFile(file) {
  const name = (file?.name || '').toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms))

async function createSignedUrlWithRetry(path, attempts = 4, delayMs = 600) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(path, 3600)
    if (data?.signedUrl) return { signedUrl: data.signedUrl, error: null }
    lastError = error
    if (i < attempts - 1) await sleep(delayMs)
  }
  return { signedUrl: null, error: lastError }
}

// Tłumaczenie na polski — te same zasady co dotychczasowy ręczny import:
// najlepszy wysiłek, brak tłumaczenia nie blokuje reszty (pozycje zostają
// edytowalne w oryginalnym języku).
async function translateItemsToPolish(readyItems) {
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
  } catch { /* najlepszy wysiłek */ }
}

async function fetchCustomsSuggestion(name, specification, photoPath) {
  let photo_url = null
  if (photoPath) {
    const { signedUrl } = await createSignedUrlWithRetry(photoPath)
    photo_url = signedUrl
  }
  const { data, error } = await supabase.functions.invoke('suggest-customs-code', {
    body: { name: name || '', specification: specification || '', photo_url },
  })
  if (error) throw error
  return data
}

// isExcelFile export — używane przez wywołujących (ProjectFiles/czat), żeby
// zdecydować, czy dany wgrany plik w ogóle kwalifikuje się do tego przepływu
// (tylko pliki .xlsx/.xls/.xlsm z kategorią "Wycena").
export { isExcelFile }

/**
 * Główna funkcja przyjęcia wyceny od zespołu CN.
 * @param {File} file - plik Excel wgrany przez użytkownika
 * @param {{id:string, client_id:string}} project
 * @param {{id:string, name?:string}} client
 * @param {string[]} existingQuoteNumbers - numery istniejących wycen (do wygenerowania kolejnego numeru)
 * @returns {Promise<{ok:boolean, quoteId:string|null, itemCount:number, notified:number, notifyFailed:boolean, uploadFailCount:number, error:string|null}>}
 */
export async function createQuoteFromExcelFile(file, project, client, existingQuoteNumbers = []) {
  const result = { ok: false, quoteId: null, itemCount: 0, notified: 0, notifyFailed: false, uploadFailCount: 0, error: null }
  try {
    const { data: { user } } = await supabase.auth.getUser()

    // 1) Sprawdź ZAWCZASU, czy jest komu przypisać zadanie — bez zespołu PL
    // przyjęcie wyceny ma się nie udać z czytelnym błędem, zamiast po cichu
    // "zniknąć" bez żadnego powiadomienia.
    const { data: assignments, error: assignErr } = await supabase.from('project_assignments')
      .select('user_id, role').eq('project_id', project.id).neq('role', 'glowny_cn')
    if (assignErr) { result.error = 'Nie udało się sprawdzić zespołu PL zamówienia: ' + assignErr.message; return result }
    const plUserIds = [...new Set((assignments || []).map(a => a.user_id).filter(Boolean))]
    if (!plUserIds.length) {
      result.error = 'To zamówienie nie ma jeszcze przypisanego nikogo z zespołu PL — przypisz opiekuna w panelu Projekty & Zamówienia, dopiero potem wgraj wycenę.'
      return result
    }

    // 2) Sparsuj Excel PRZED zapisem czegokolwiek — jeśli się nie uda, nic nie zostaje utworzone.
    let parsedItems
    try {
      parsedItems = await parseQuoteExcel(file)
    } catch (e) {
      result.error = 'Nie udało się odczytać pliku Excel: ' + (e?.message || e)
      return result
    }
    if (!parsedItems.length) {
      result.error = 'Nie rozpoznano żadnych pozycji w tym pliku Excel.'
      return result
    }

    // 3) Wgraj oryginalny plik Excel do Storage (do wglądu / ponownego sparsowania).
    const excelExt = (file.name.split('.').pop() || 'xlsx').toLowerCase()
    const excelPath = `${client.id}/wycena-excel-${crypto.randomUUID()}.${excelExt}`
    const { error: excelUpErr } = await supabase.storage.from('dokumenty').upload(excelPath, file)
    if (excelUpErr) { result.error = 'Nie udało się wgrać pliku Excel: ' + excelUpErr.message; return result }

    // 4) Tłumaczenie na polski PRZED zapisem pozycji (żeby sugestia CN/HS niżej już pracowała na polskim tekście).
    await translateItemsToPolish(parsedItems)

    // 5) Utwórz wycenę — status od razu 'do_marzy_pl', bo zespół CN swoją część już zrobił.
    const quote_number = nextQuoteNumber(existingQuoteNumbers)
    const { data: quote, error: qErr } = await supabase.from('quotes').insert({
      quote_number, client_id: client.id, project_id: project.id,
      status: 'do_marzy_pl', currency: 'CNY', created_by: user?.id,
      source_excel_path: excelPath, source_excel_name: file.name,
      notes: '1. Wycena ważna jest 15 dni.\n2. Wycena zawiera: [uzupełnij zakres].\n3. Wycena nie zawiera: transportu, montażu, [uzupełnij].\n4. Czas produkcji: ok. [uzupełnij] dni roboczych.',
    }).select().single()
    if (qErr) { result.error = 'Nie udało się utworzyć wyceny: ' + qErr.message; return result }
    result.quoteId = quote.id

    // 6) Wgraj zdjęcia wyciągnięte z Excela (visible_in_files:false — patrz
    // uzasadnienie w QuoteEditor.jsx: dokument staje się widoczny w Plikach
    // projektu dopiero przy jawnej akcji zespołu PL, nie przy samym imporcie).
    // Zdjęcia (per pozycja) i sugestia kodu CN/HS (edge function AI, kilka-
    // kilkanaście sekund NA POZYCJĘ) są robione RÓWNOLEGLE dla wszystkich
    // pozycji naraz (Promise.all) — sekwencyjna pętla tutaj wcześniej
    // potrafiła "zawiesić" import na kilka minut przy wycenie z wieloma
    // pozycjami (realnie zgłoszony problem: przycisk "Przetwarzanie…" wisiał
    // bez końca). Ten sam wzorzec równoległości jest już używany w
    // QuoteEditor.jsx przy ręcznym imporcie z Excela.
    const itemsWithPhotos = await Promise.all(parsedItems.map(async (p) => {
      const dataUrls = p._photoDataUrls || []
      const photoPaths = []
      for (const dataUrl of dataUrls) {
        try {
          const blob = await (await fetch(dataUrl)).blob()
          if (isFileTooBig(blob)) { result.uploadFailCount++; continue }
          const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
          const path = `${client.id}/wycena-${quote.id}-${crypto.randomUUID()}-excel-import.${ext}`
          const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, blob, { contentType: blob.type || 'image/jpeg' })
          if (upErr) throw upErr
          await supabase.from('documents').insert({
            client_id: client.id, project_id: project.id,
            category: 'Zdjęcie towaru (wycena)', file_path: path, file_name: `excel-${p.name || 'produkt'}.${ext}`,
            uploaded_by: user?.id, source: 'excel_import', visible_in_files: false,
          })
          photoPaths.push(path)
        } catch { result.uploadFailCount++ }
      }
      return { p, photoPaths }
    }))

    const itemRows = await Promise.all(itemsWithPhotos.map(async ({ p, photoPaths }, i) => {
      // Sugestia kodu CN/HS + stawki cła — najlepszy wysiłek, tak jak
      // dotychczas przy ręcznym imporcie. Jeśli Excel już podał realną
      // stawkę cła, nie nadpisujemy jej sugestią AI.
      let hsCode = null
      let dutyRate = p.duty_rate_percent === '' || p.duty_rate_percent === undefined ? null : p.duty_rate_percent
      try {
        const data = await fetchCustomsSuggestion(p.name, p.specification, photoPaths[0])
        if (data?.hs_code) hsCode = data.hs_code
        if (dutyRate === null && data?.duty_rate_percent !== undefined && data?.duty_rate_percent !== null) dutyRate = data.duty_rate_percent
      } catch { /* najlepszy wysiłek */ }

      return {
        quote_id: quote.id, position: i + 1,
        name: p.name || null, specification: p.specification || null,
        qty: p.qty || 1, unit: p.unit || 'set', unit_price_cny: p.unit_price_cny || 0,
        cbm: p.cbm === '' || p.cbm === undefined ? null : p.cbm,
        weight_kg: p.weight_kg === '' || p.weight_kg === undefined ? null : p.weight_kg,
        container_note: p.container_note || null,
        production_days: p.production_days || null,
        hs_code: hsCode, duty_rate_percent: dutyRate,
        photo_paths: photoPaths, photo_path: photoPaths[0] || null,
      }
    }))
    const { error: itemsErr } = await supabase.from('quote_items').insert(itemRows)
    if (itemsErr) { result.error = 'Wycena utworzona, ale nie udało się zapisać pozycji: ' + itemsErr.message; return result }
    result.itemCount = itemRows.length

    // 7) Powiadom cały zespół PL (zadanie w Centrum zadań).
    try {
      const taskResults = await Promise.all(plUserIds.map(uid => supabase.from('tasks').insert({
        title: `Dodaj marżę i wyślij wycenę ${quote_number} do klienta`,
        description: `Zespół chiński przekazał wycenę ${quote_number}${client?.name ? ' (' + client.name + ')' : ''} — dodaj koszty transportu/odprawy/dostawy i marżę, sprawdź kursy NBP i wyślij do klienta.`,
        project_id: project.id, client_id: client.id, quote_id: quote.id,
        assigned_to: uid, assigned_by: user?.id,
        due_date: new Date().toISOString().slice(0, 10), status: 'todo', priority: 'pilne',
      })))
      result.notified = taskResults.filter(r => !r.error).length
      result.notifyFailed = taskResults.some(r => r.error)
    } catch {
      result.notifyFailed = true
    }

    result.ok = true
    return result
  } catch (e) {
    result.error = e?.message || String(e)
    return result
  }
}
