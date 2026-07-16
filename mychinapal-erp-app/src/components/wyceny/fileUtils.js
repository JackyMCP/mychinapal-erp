// Mały, wspólny helper wydzielony z dawnego pdf.js (moduł PDF został usunięty
// w zadaniu #220, po przejściu na Excel jako dokument dla klienta — zob.
// excelExport.js) — fetchAsDataUrl był jedyną częścią pdf.js, która nadal
// była potrzebna (do wczytania logo jako base64 do osadzenia w pliku Excel).
export async function fetchAsDataUrl(url) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
  } catch { return null }
}
