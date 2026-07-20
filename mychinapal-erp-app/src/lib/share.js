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
  if (!url) { toast?.error(t('Nie udało się przygotować pliku do udostępnienia — plik mógł zostać usunięty albo zastąpiony nowszą wersją.')); return { ok: false } }

  // Próba udostępnienia PRAWDZIWEGO pliku (nie tylko linku) — działa tylko
  // tam, gdzie przeglądarka wspiera Web Share API z plikami (głównie telefony).
  if (navigator.canShare && navigator.share) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], fileName || 'plik', { type: blob.type || 'application/octet-stream' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || fileName, text: text || undefined })
        return { ok: true }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: true } // użytkownik anulował okno udostępniania — nie pokazujemy fallbacku
      // spadamy do fallbacku poniżej
    }
  }

  // Fallback 1: udostępnienie samego linku (bez pliku) — nadal otwiera
  // systemowe okno "Udostępnij" tam, gdzie jest wspierane.
  if (navigator.share) {
    try {
      await navigator.share({ title: title || fileName, text: text || fileName, url })
      return { ok: true }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: true }
    }
  }

  // Fallback 2: żadne z powyższych nie zadziałało (desktop bez Web Share API,
  // albo Safari z kapryśnym navigator.clipboard — wymaga "świeżego" gestu
  // użytkownika, a kilka await-ów wcześniej po drodze go "zużywa"). Zamiast
  // otwierać plik w nowej karcie przeglądarki (wyrywa z aplikacji), zwracamy
  // sygnał do komponentu wywołującego, żeby pokazał podgląd W APLIKACJI
  // (patrz FilePreviewModal) z linkiem skopiowanym do schowka, jeśli się udało.
  const copied = await copyToClipboard(url)
  if (copied) toast?.success(t('Skopiowano link do schowka — możesz go wkleić w WhatsApp/Messenger/WeChat. Otwieramy też podgląd pliku.'))
  else toast?.success(t('Otwieramy podgląd pliku — stamtąd możesz go pobrać i wysłać ręcznie.'))
  return { ok: false, fallbackUrl: url, fallbackFileName: fileName }
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
