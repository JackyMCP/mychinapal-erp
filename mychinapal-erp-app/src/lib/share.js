import { supabase } from './supabaseClient'

// Pomocnik "Udostępnij na zewnątrz" (WhatsApp / Messenger / WeChat / e-mail
// itd.) — patrz decyzja z użytkownikiem przy budowie "Prześlij dalej" w
// czacie: prawdziwe automatyczne wysyłanie WPROST do cudzego konta w innej
// appce nie jest technicznie możliwe bez API i zgody odbiorcy tamtej appki.
// Realny odpowiednik to systemowe okno "Udostępnij" (Web Share API) — to
// samo okno co przy udostępnianiu zdjęcia z telefonu, z ikonami zainstalowanych
// aplikacji (WhatsApp, Messenger, Mail itd.). Na komputerze/w przeglądarkach
// bez wsparcia Web Share API — fallback: kopiowanie linku/tekstu do schowka.

export async function getSignedFileUrl(filePath, expiresSec = 3600) {
  if (!filePath) return null
  const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(filePath, expiresSec)
  if (error) return null
  return data?.signedUrl || null
}

async function copyToClipboard(str) {
  try {
    await navigator.clipboard.writeText(str)
    return true
  } catch {
    return false
  }
}

// Udostępnia plik (z magazynu 'dokumenty') albo, jeśli udostępnianie plików
// nie jest wspierane, sam link do niego. `toast` to obiekt {success,error} z
// lib/ui.jsx — przekazywany z komponentu wywołującego, żeby dać użytkownikowi
// czytelną informację co się stało (skopiowano / brak wsparcia itd.).
export async function shareFile({ filePath, fileName, title, text, toast, t = (s) => s }) {
  const url = await getSignedFileUrl(filePath)
  if (!url) { toast?.error(t('Nie udało się przygotować pliku do udostępnienia — plik mógł zostać usunięty albo zastąpiony nowszą wersją.')); return }

  // Próba udostępnienia PRAWDZIWEGO pliku (nie tylko linku) — działa tylko
  // tam, gdzie przeglądarka wspiera Web Share API z plikami (głównie telefony).
  if (navigator.canShare && navigator.share) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], fileName || 'plik', { type: blob.type || 'application/octet-stream' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || fileName, text: text || undefined })
        return
      }
    } catch (e) {
      if (e?.name === 'AbortError') return // użytkownik anulował okno udostępniania
      // spadamy do fallbacku poniżej
    }
  }

  // Fallback 1: udostępnienie samego linku (bez pliku) — nadal otwiera
  // systemowe okno "Udostępnij" tam, gdzie jest wspierane.
  if (navigator.share) {
    try {
      await navigator.share({ title: title || fileName, text: text || fileName, url })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
  }

  // Fallback 2: kopiuj link do schowka — na desktopowym Safari/Chrome
  // navigator.clipboard bywa jednak kapryśny (wymaga "świeżego" gestu
  // użytkownika, a kilka await-ów wcześniej po drodze go "zużywa"), więc
  // NIE polegamy tylko na nim. Zawsze też otwieramy plik w nowej karcie —
  // to działa niezawodnie wszędzie, a stamtąd przeglądarka ma WŁASNĄ,
  // natywną ikonę "Udostępnij" (widoczną w toolbarze Safari) — dużo
  // pewniejszą niż nasza próba z JS.
  const copied = await copyToClipboard(url)
  window.open(url, '_blank')
  if (copied) toast?.success(t('Otworzyliśmy plik w nowej karcie i skopiowaliśmy link do schowka — możesz go wkleić w WhatsApp/Messenger/WeChat, albo użyć ikony „Udostępnij” w przeglądarce.'))
  else toast?.success(t('Otworzyliśmy plik w nowej karcie — użyj tam ikony „Udostępnij” w przeglądarce, albo zapisz plik i wyślij go ręcznie.'))
}

// Udostępnia sam tekst (np. treść wiadomości z czatu, bez załącznika).
export async function shareText({ title, text, toast, t = (s) => s }) {
  if (navigator.share) {
    try {
      await navigator.share({ title: title || undefined, text })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
  }
  const ok = await copyToClipboard(text)
  if (ok) { toast?.success(t('Skopiowano treść — wklej ją w WhatsApp, Messenger, WeChat itd.')); return }
  // Fallback bez schowka: natywne okno przeglądarki z tekstem zaznaczonym do
  // ręcznego skopiowania (Cmd/Ctrl+C) — działa zawsze, bez żadnych uprawnień.
  window.prompt(t('Skopiuj tekst poniżej (Cmd/Ctrl+C):'), text)
}
