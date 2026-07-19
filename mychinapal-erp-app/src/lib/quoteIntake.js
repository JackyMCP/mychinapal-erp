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
    const items = await parseQuoteExcel(file)
    if (!items.length) return { value: null, itemCount: 0 }
    const total = items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price_cny), 0)
    return { value: Math.round(total * 100) / 100, itemCount: items.length }
  } catch {
    return { value: null, itemCount: 0 }
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
export async function checkPlTeamAssigned(project) {
  const { data: assignments, error: assignErr } = await supabase.from('project_assignments')
    .select('user_id, role').eq('project_id', project.id).neq('role', 'glowny_cn')
  if (assignErr) return { ok: false, plUserIds: [], error: 'Nie udało się sprawdzić zespołu przypisanego do zamówienia: ' + assignErr.message }
  const plUserIds = [...new Set((assignments || []).map(a => a.user_id).filter(Boolean))]
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
      const { data: rows } = await supabase.from('quotes').select('quote_number')
      const quote_number = nextQuoteNumber((rows || []).map(r => r.quote_number))
      const { data: inserted, error: insErr } = await supabase.from('quotes').insert({
        quote_number, client_id: client.id, project_id: project.id, created_by: user?.id, ...patch,
      }).select().single()
      if (insErr) { result.error = 'Nie udało się utworzyć wyceny: ' + insErr.message; return result }
      quote = inserted
    }
    result.quoteId = quote.id

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
