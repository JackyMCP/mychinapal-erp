import { supabase } from './supabaseClient'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Wywołuje edge function 'translate-chat-message' zaraz po wysłaniu wiadomości na czacie.
// Fire-and-forget: nie czekamy na wynik w UI — funkcja sama zapisuje tłumaczenie w
// chat_messages.translated_content, a istniejący nasłuch realtime (UPDATE na chat_messages)
// w każdym z komponentów czatu odbiera je automatycznie i dorysowuje pod wiadomością.
//
// NAPRAWA (lipiec 2026): supabase.functions.invoke() przy błędzie HTTP (np. 502 z
// edge function) NIE rzuca wyjątku — zwraca { data: null, error }. Poprzednia wersja
// sprawdzała tylko .catch() na rzucony wyjątek, więc te błędy przechodziły całkowicie
// niezauważone i wiadomość na zawsze zostawała bez tłumaczenia. Teraz sprawdzamy pole
// `error` i ponawiamy próbę (do 3 razy łącznie) z krótkim opóźnieniem, zanim się poddamy.
async function callTranslateWithRetry(payload, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await supabase.functions.invoke('translate-chat-message', { body: payload })
      if (!error) return true
      console.error(`translate-chat-message error (próba ${attempt}/${maxAttempts})`, error)
    } catch (err) {
      console.error(`translate-chat-message invoke rzucił wyjątek (próba ${attempt}/${maxAttempts})`, err)
    }
    if (attempt < maxAttempts) await sleep(attempt * 800) // 800ms, 1600ms
  }
  console.error('translate-chat-message: ostatecznie nieudane dla message_id=', payload.message_id)
  return false
}

export function triggerTranslation(inserted) {
  if (!inserted?.id || !inserted?.content) return
  // pomijamy wiadomości będące tylko załącznikiem (np. "📎 plik.pdf") — nie ma czego tłumaczyć
  if (/^📎/.test(inserted.content.trim())) return
  callTranslateWithRetry({ message_id: inserted.id, content: inserted.content })
}

// Wywołuje edge function 'send-chat-push', która wysyła prawdziwe powiadomienie
// push (na telefon/komputer) do wszystkich uprawnionych odbiorców kanału,
// z pominięciem nadawcy. Fire-and-forget — nie blokuje UI wysyłania wiadomości.
export function triggerPushNotification(inserted) {
  if (!inserted?.id) return
  supabase.functions.invoke('send-chat-push', {
    body: { message_id: inserted.id },
  }).catch(err => console.error('send-chat-push invoke failed', err))
}
