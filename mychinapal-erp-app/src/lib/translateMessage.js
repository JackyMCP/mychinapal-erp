import { supabase } from './supabaseClient'

// Wywołuje edge function 'translate-chat-message' zaraz po wysłaniu wiadomości na czacie.
// Fire-and-forget: nie czekamy na wynik w UI — funkcja sama zapisuje tłumaczenie w
// chat_messages.translated_content, a istniejący nasłuch realtime (UPDATE na chat_messages)
// w każdym z komponentów czatu odbiera je automatycznie i dorysowuje pod wiadomością.
export function triggerTranslation(inserted) {
  if (!inserted?.id || !inserted?.content) return
  // pomijamy wiadomości będące tylko załącznikiem (np. "📎 plik.pdf") — nie ma czego tłumaczyć
  if (/^📎/.test(inserted.content.trim())) return
  supabase.functions.invoke('translate-chat-message', {
    body: { message_id: inserted.id, content: inserted.content },
  }).catch(err => console.error('translate-chat-message invoke failed', err))
}
