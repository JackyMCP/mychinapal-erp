import { supabase } from './supabaseClient'
import { parseQuoteExcel } from '../components/wyceny/excelImport'
import { nextQuoteNumber, toNum } from '../components/wyceny/calc'

// NOWY MODEL WYCEN (uproszczony, na wyraźną prośbę): zamiast rozbijać Excela
// na pozycje/zdjęcia/kody CN-HS (dawny mechanizm — usunięty), każde
// zamówienie ma co najwyżej JEDNĄ "kartę wyceny" (tabela `quotes`, unique na
// project_id) z dwoma slotami:
//   - CN: surowy plik Excel od zespołu chińskiego + wykryta z niego wartość (CNY)
//   - PL: TEN SAM plik, poprawiony przez zespół polski (doliczona marża) +
//     wykryta z niego wartość dla klienta (PLN)
// Plik wgrywa się z DOWOLNEGO miejsca (czat zamówienia/klienta/zarządu, panel
// plików projektu, zakładka Wyceny) z kategorią "Wycena CN" albo "Wycena dla
// klienta" — efekt jest zawsze identyczny: plik trafia do Dokumentów, karta
// wyceny tego zamówienia się aktualizuje (nadpisuje odpowiedni slot), etap
// się odblokowuje, a przy stronie CN cały zespół przypisany do zamówienia
// dostaje zadanie w Centrum zadań. Żadnego ekranu z pozycjami do poprawiania
// — tylko jedna wykryta suma do szybkiej weryfikacji/edycji (patrz
// QuoteValueModal.jsx) tuż przed zapisaniem.
function isExcelFile(file) {
  const name = (file?.name || '').toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')
}
export { isExcelFile }

/**
 * Próbuje wykryć łączną wartość wyceny z pliku Excel — reużywa tego samego
 * (sprawdzonego) wykrywania kolumn Ilość/Cena co dawny import pozycji, ale
 * NIE zapisuje żadnych pozycji/zdjęć/kodów CN-HS — liczy tylko sumę
 * ilość×cena po wszystkich rozpoznanych wierszach. Dla plików innych niż
 * Excel (albo gdy parsowanie się nie powiedzie/nic nie rozpozna) zwraca
 * `value: null` — wtedy użytkownik wpisuje sumę ręcznie w oknie weryfikacji.
 * @returns {Promise<{value:number|null, itemCount:number}>}
 */
export async function detectQuoteValue(file) {
  if (!isExcelFile(file)) return { value: null, itemCount: 0 }
  try {
    // extractImages: false — to tylko suma ilość×cena, zdjęcia z komórek nie
    // są tu w ogóle używane (patrz komentarz przy parseQuoteExcel). Dla
    // dużych plików ze zdjęciami wyciąganie ich bez potrzeby potrafiło
    // sprawiać wrażenie "zawieszonego" wgrywania.
    const items = await parseQuoteExcel(file, { extractImages: false })
    if (!items.length) return { value: null, itemCount: 0 }
    const total = items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price_cny), 0)
    return { value: Math.round(total * 100) / 100, itemCount: items.length }
  } catch {
    return { value: null, itemCount: 0 }
  }
}

/**
 * Pobiera już wgrany plik wyceny ze Storage i parsuje go (ta sama logika co
 * przy wgrywaniu) do szybkiego podglądu pozycji w aplikacji — bez ściągania
 * pliku na dysk. Używane przez przycisk "Podgląd" na kafelku w module Wyceny.
 * @returns {Promise<{ok:boolean, rows:Array, total:number, error:string|null}>}
 */
export async function previewQuoteFile(path, fileName) {
  try {
    const { data: blob, error: dlErr } = await supabase.storage.from('dokumenty').download(path)
    if (dlErr) return { ok: false, rows: [], total: 0, error: 'Nie udało się pobrać pliku: ' + dlErr.message }
    const file = new File([blob], fileName || 'plik.xlsx', { type: blob.type })
    const rows = await parseQuoteExcel(file)
    const total = rows.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price_cny), 0)
    return { ok: true, rows, total: Math.round(total * 100) / 100, error: null }
  } catch (e) {
    return { ok: false, rows: [], total: 0, error: e?.message || String(e) }
  }
}

/**
 * Zwraca listę osób przypisanych do zamówienia (poza rolą 'glowny_cn'), do
 * powiadomienia zadaniem w Centrum zadań. WAŻNE: brak przypisanego zespołu
 * NIE MA blokować przyjęcia wyceny — wycena ma się ZAWSZE przyjąć i
 * odblokować kolejny etap, bez względu na to, skąd jest wgrywana i czy
 * komukolwiek jest przypisana. Jeśli nikt nie jest przypisany, po prostu
 * nikt nie dostaje zadania — to nie błąd.
 * @returns {Promise<{ok:boolean, plUserIds:string[], error:string|null}>}
 */
/**
 * Pobiera bieżący średni kurs NBP CNY->PLN (tabela A, bez prowizji banku).
 * Używane do automatycznego przeliczenia „Koszt zakupu towaru (Chiny)” w
 * tabelce zysku zamówienia (patrz ProfitTable.jsx) tuż po wgraniu wyceny CN,
 * a także przez przycisk „Zaktualizuj wg NBP” do ręcznego odświeżenia kursu.
 * @returns {Promise<{mid:number, effectiveDate:string}>}
 */
export async function fetchNbpCnyRate() {
  const resp = await fetch('https://api.nbp.pl/api/exchangerates/rates/a/cny/?format=json')
  if (!resp.ok) throw new Error('NBP API: ' + resp.status)
  const data = await resp.json()
  const rate = data?.rates?.[0]
  if (!rate) throw new Error('Brak danych w odpowiedzi NBP')
  return { mid: rate.mid, effectiveDate: rate.effectiveDate }
}

export async function checkPlTeamAssigned(project) {
  const { data: assignments, error: assignErr } = await supabase.from('project_assignments')
    .select('user_id, role').eq('project_id', project.id)
  if (assignErr) return { ok: false, plUserIds: [], error: 'Nie udało się sprawdzić zespołu przypisanego do zamówienia: ' + assignErr.message }
  // WAŻNE: filtr "nie jest głównym CN" musi być po stronie JS, nie jako
  // `.neq('role', 'glowny_cn')` w zapytaniu — w SQL `NULL <> 'glowny_cn'` daje
  // NIEZNANE (nie PRAWDA), więc wiersze z rolą NULL są przez taki filtr po
  // cichu wykluczane. W praktyce większość przypisań (dodanych szybkim
  // przypisaniem, bez wyboru konkretnej roli) ma rolę NULL — więc ten błąd
  // sprawiał, że "powiadomiono 0 os. z zespołu" pokazywało się niemal zawsze,
  // nawet gdy ktoś był realnie przypisany do zamówienia.
  const plUserIds = [...new Set((assignments || [])
    .filter(a => a.role !== 'glowny_cn')
    .map(a => a.user_id)
    .filter(Boolean))]
  return { ok: true, plUserIds, error: null }
}

/**
 * Zapisuje plik wyceny (CN albo PL) na karcie wyceny zamówienia — jeden
 * wywoływany punkt dla WSZYSTKICH miejsc wgrywania (czat zamówienia/klienta/
 * zarządu, panel plików, zakładka Wyceny). Wgrywa plik do Storage, dokłada
 * wpis w Dokumentach (kategoria "Wycena CN"/"Wycena dla klienta"), i
 * tworzy/nadpisuje jedyną kartę wyceny (`quotes`, unique project_id) tego
 * zamówienia. Przy stronie CN dodatkowo powiadamia (zadanie w Centrum zadań,
 * bez duplikatów przy ponownym wgraniu) cały zespół przypisany do zamówienia.
 * @param {{file:File, project:{id:string, client_id:string}, client:{id:string, name?:string}, side:'cn'|'pl', value:number, source?:string}} args
 * @returns {Promise<{ok:boolean, quoteId:string|null, notified:number, notifyFailed:boolean, overwritten:boolean, error:string|null}>}
 */
export async function saveQuoteFile({ file, project, client, side, value, source = 'manual' }) {
  const result = { ok: false, quoteId: null, notified: 0, notifyFailed: false, overwritten: false, error: null }
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const ext = (file.name.split('.').pop() || 'xlsx').toLowerCase()
    const path = `${client.id}/wycena-${side}-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('dokumenty').upload(path, file)
    if (upErr) { result.error = 'Nie udało się wgrać pliku: ' + upErr.message; return result }

    const category = side === 'cn' ? 'Wycena CN' : 'Wycena dla klienta'
    await supabase.from('documents').insert({
      client_id: client.id, project_id: project.id, category,
      file_path: path, file_name: file.name, uploaded_by: user?.id, source,
    })

    const { data: existing } = await supabase.from('quotes').select('*').eq('project_id', project.id).maybeSingle()

    const patch = side === 'cn'
      ? { source_excel_path: path, source_excel_name: file.name, source_value_cny: value }
      : { client_excel_path: path, client_excel_name: file.name, client_value_pln: value, sent_at: new Date().toISOString() }
    const nextClientPath = side === 'pl' ? path : (existing?.client_excel_path || null)
    patch.status = nextClientPath ? 'wyslana' : 'szkic_cn'

    let quote
    if (existing) {
      const { data: updated, error: updErr } = await supabase.from('quotes').update(patch).eq('id', existing.id).select().single()
      if (updErr) { result.error = 'Nie udało się zapisać wyceny: ' + updErr.message; return result }
      quote = updated
      result.overwritten = true
    } else {
      // Numer wyceny liczony jest z migawki istniejących numerów po stronie
      // klienta (nextQuoteNumber) — bez blokady na poziomie bazy. Gdy dwa
      // wgrania trafiają się prawie równocześnie (np. ten sam Excel wchodzi
      // przez czat I panel plików projektu), oba mogą policzyć ten sam
      // "kolejny" numer i zderzyć się o unique constraint
      // quotes_quote_number_unique. Naprawa: przy takim konflikcie pobieramy
      // świeżą listę numerów i próbujemy ponownie (do 5 razy), zamiast od
      // razu zwracać błąd użytkownikowi.
      let inserted = null
      let insErr = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: rows } = await supabase.from('quotes').select('quote_number')
        const quote_number = nextQuoteNumber((rows || []).map(r => r.quote_number))
        const res = await supabase.from('quotes').insert({
          quote_number, client_id: client.id, project_id: project.id, created_by: user?.id, ...patch,
        }).select().single()
        if (!res.error) { inserted = res.data; insErr = null; break }
        insErr = res.error
        // Ponawiamy tylko przy konflikcie numeru — inne błędy (np. RLS,
        // sieć) nie znikną przy kolejnej próbie.
        if (res.error.code !== '23505' || !(res.error.message || '').includes('quote_number')) break
      }
      if (insErr) { result.error = 'Nie udało się utworzyć wyceny: ' + insErr.message; return result }
      quote = inserted
    }
    result.quoteId = quote.id

    // Synchronizacja z tabelką "Podsumowanie — szacowany zysk" zamówienia
    // (ProfitTable.jsx): CN -> "Koszt zakupu towaru (Chiny)" (CNY z pliku +
    // od razu przeliczone na PLN wg bieżącego kursu NBP), PL -> "Koszt dla
    // klienta (netto)" (wprost w PLN, bez przeliczania). Najlepszy wysiłek —
    // niepowodzenie (np. brak zasięgu do NBP) nie blokuje zapisania wyceny;
    // PLN można wtedy dociągnąć później przyciskiem "Zaktualizuj wg NBP".
    try {
      if (side === 'cn') {
        const patchProject = { est_zakup_cny: value }
        try {
          const rate = await fetchNbpCnyRate()
          patchProject.est_zakup = Math.round(value * rate.mid * 100) / 100
          patchProject.est_zakup_nbp_rate = rate.mid
          patchProject.est_zakup_nbp_date = rate.effectiveDate
        } catch (rateErr) {
          // kurs NBP niedostępny teraz — sama kwota CNY i tak się zapisze,
          // PLN można dociągnąć później przyciskiem "Zaktualizuj wg NBP"
          console.warn('[quoteIntake] fetchNbpCnyRate failed:', rateErr)
        }
        const { error: projErr } = await supabase.from('projects').update(patchProject).eq('id', project.id)
        if (projErr) console.error('[quoteIntake] projects update (CN sync) failed:', projErr)
      } else {
        const { error: projErr } = await supabase.from('projects').update({ value }).eq('id', project.id)
        if (projErr) console.error('[quoteIntake] projects update (PL sync) failed:', projErr)
      }
    } catch (syncErr) {
      // najlepszy wysiłek — wycena i tak zapisana poprawnie, tylko kafelek w
      // tabelce zysku (ProfitTable.jsx) trzeba by było wtedy uzupełnić ręcznie
      console.error('[quoteIntake] project profit-table sync failed:', syncErr)
    }

    // Powiadomienie (zadanie w Centrum zadań) tylko przy stronie CN — to
    // zespół PL ma wtedy dodać marżę i wysłać gotową wycenę do klienta.
    // Jeśli ktoś ma już OTWARTE (nieukończone) zadanie dla TEJ SAMEJ karty
    // wyceny (np. bo plik CN był poprawiany i wgrywany kilka razy pod rząd),
    // tylko odśwież termin/opis zamiast tworzyć kolejny duplikat.
    if (side === 'cn') {
      try {
        const plCheck = await checkPlTeamAssigned(project)
        if (!plCheck.ok) throw new Error(plCheck.error)
        const plUserIds = plCheck.plUserIds
        const { data: existingTasks } = await supabase.from('tasks')
          .select('id, assigned_to, status').eq('quote_id', quote.id).in('assigned_to', plUserIds)
        const openByUser = new Map((existingTasks || []).filter(t => t.status !== 'done').map(t => [t.assigned_to, t]))
        const title = `Dodaj marżę i wyślij wycenę ${quote.quote_number} do klienta`
        const description = `Zespół chiński przekazał wycenę ${quote.quote_number}${client?.name ? ' (' + client.name + ')' : ''} (wartość: ${value} CNY) — dolicz marżę i wgraj gotowy plik jako „Wycena dla klienta”.`
        const todayStr = new Date().toISOString().slice(0, 10)
        const toInsert = plUserIds.filter(uid => !openByUser.has(uid))
        const toUpdate = plUserIds.filter(uid => openByUser.has(uid))
        const [insertRes, updateResArr] = await Promise.all([
          toInsert.length
            ? supabase.from('tasks').insert(toInsert.map(uid => ({
                title, description, project_id: project.id, client_id: client.id, quote_id: quote.id,
                assigned_to: uid, assigned_by: user?.id, due_date: todayStr, status: 'todo', priority: 'pilne',
              })))
            : Promise.resolve({ error: null }),
          Promise.all(toUpdate.map(uid => supabase.from('tasks').update({ title, description, due_date: todayStr }).eq('id', openByUser.get(uid).id))),
        ])
        result.notified = toInsert.length + toUpdate.length
        result.notifyFailed = !!insertRes.error || updateResArr.some(r => r.error)
      } catch {
        result.notifyFailed = true
      }
    }

    result.ok = true
    return result
  } catch (e) {
    result.error = e?.message || String(e)
    return result
  }
}
