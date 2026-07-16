// Zadanie w Centrum zadań (tabela `tasks`) często dotyczy konkretnej rzeczy
// — wyceny, faktury, zamówienia albo klienta — ale do niedawna nie dało się
// z niego przejść do tej rzeczy jednym kliknięciem (trzeba było szukać
// ręcznie w odpowiednim module). `quote_id`/`invoice_id` to nowe kolumny na
// `tasks` (project_id/client_id już istniały) — ta funkcja zamienia
// zadanie na docelową ścieżkę, w kolejności od najbardziej precyzyjnej.
// Wszystkie te trasy już wspierają otwarcie konkretnego rekordu z query
// param: Wyceny (?quote=), Faktury (?invoice= — już działało wcześniej),
// Projekty (?project=), Klienci (?client=).
export function taskTargetPath(task) {
  if (!task) return null
  if (task.quote_id) return `/wyceny?quote=${task.quote_id}`
  if (task.invoice_id) return `/faktury?invoice=${task.invoice_id}`
  if (task.project_id) return `/projekty?project=${task.project_id}`
  if (task.client_id) return `/klienci?client=${task.client_id}`
  return null
}
