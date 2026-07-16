// Domyślny układ wizualny wyceny (edytor "jak Canva") — gdy użytkownik
// pierwszy raz otwiera edytor wyglądu dla danej wyceny, zaczyna NIE od pustej
// strony, tylko od układu odtwarzającego dzisiejszy, sprawdzony szablon
// (pdf.js) — żeby mieć od czego zacząć, zamiast rysować wszystko od zera.
// Współrzędne w mm, strona A4 = 210 x 297mm.

export const PAGE_W = 210
export const PAGE_H = 297

export const FONT_OPTIONS = [
  { value: 'LiberationSans', label: 'Liberation Sans (domyślna, z polskimi znakami)' },
  { value: 'helvetica', label: 'Helvetica (bez polskich znaków)' },
  { value: 'times', label: 'Times' },
  { value: 'courier', label: 'Courier (maszynowa)' },
]

let idCounter = 0
const uid = () => `el_${Date.now().toString(36)}_${(idCounter++).toString(36)}`

export function buildDefaultLayout() {
  const navy = '#0A1628'
  const gold = '#B48C28'
  const muted = '#646464'
  return {
    pageWidthMm: PAGE_W,
    pageHeightMm: PAGE_H,
    elements: [
      {
        id: uid(), type: 'rect', x: 0, y: 0, w: PAGE_W, h: 28, z: 0,
        bg: navy, radius: 0, opacity: 1,
      },
      {
        id: uid(), type: 'image', x: 14, y: 6, w: 42, h: 16, z: 1,
        src: 'logo', radius: 0,
      },
      {
        id: uid(), type: 'text', x: 100, y: 6, w: 96, h: 8, z: 1,
        text: 'QUOTATION / WYCENA', fontFamily: 'LiberationSans', fontSize: 16, bold: true,
        color: '#FFFFFF', align: 'right', bg: null,
      },
      {
        id: uid(), type: 'text', x: 100, y: 15, w: 96, h: 6, z: 1,
        text: '{{quote_number}}', fontFamily: 'LiberationSans', fontSize: 9, bold: false,
        color: gold, align: 'right', bg: null,
      },
      {
        id: uid(), type: 'text', x: 14, y: 34, w: 90, h: 6, z: 1,
        text: 'Date / Data: {{date}}', fontFamily: 'LiberationSans', fontSize: 9, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'text', x: 120, y: 34, w: 76, h: 6, z: 1,
        text: 'Valid until / Ważna do: {{valid_until}}', fontFamily: 'LiberationSans', fontSize: 9, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'rect', x: 14, y: 38, w: 86, h: 32, z: 0,
        bg: '#F7F8FA', radius: 1.5, opacity: 1,
      },
      {
        id: uid(), type: 'rect', x: 104, y: 38, w: 86, h: 32, z: 0,
        bg: '#F7F8FA', radius: 1.5, opacity: 1,
      },
      {
        id: uid(), type: 'text', x: 17, y: 43, w: 80, h: 26, z: 1,
        text: 'SELLER / SPRZEDAWCA\n{{seller_block}}', fontFamily: 'LiberationSans', fontSize: 8.5, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'text', x: 107, y: 43, w: 80, h: 26, z: 1,
        text: 'BUYER / NABYWCA\n{{buyer_block}}', fontFamily: 'LiberationSans', fontSize: 8.5, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'text', x: 14, y: 76, w: 100, h: 6, z: 1,
        text: 'ITEMS / POZYCJE TOWARU', fontFamily: 'LiberationSans', fontSize: 10, bold: true,
        color: navy, align: 'left', bg: null,
      },
      {
        id: uid(), type: 'itemsTable', x: 14, y: 84, w: 182, h: 160, z: 1,
        fontFamily: 'LiberationSans', fontSize: 11, specFontSize: 8.5,
        cardBg: '#FFFFFF', cardBorder: '#E1E3E7', priceColor: gold, textColor: '#141414', mutedColor: muted,
      },
      {
        id: uid(), type: 'summary', x: 14, y: 250, w: 182, h: 40, z: 1,
        fontFamily: 'LiberationSans', fontSize: 10, color: '#141414', totalColor: gold, muted: muted,
      },
      // Objaśnienia (quote.notes) i numer konta pokazują się TYLKO gdy
      // faktycznie są wypełnione (showIf) — dokładnie jak w starym, sztywnym
      // szablonie. W edytorze pozostają widoczne/przesuwalne cały czas (żeby
      // dało się je z góry ustawić), w finalnym PDF-ie znikają całkowicie,
      // jeśli dana wycena nie ma notatek / firma nie ma ustawionego konta.
      {
        id: uid(), type: 'text', x: 14, y: 258, w: 182, h: 20, z: 1, showIf: 'notes',
        text: 'Explanation / Objaśnienia:\n{{notes}}', fontFamily: 'LiberationSans', fontSize: 8, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'text', x: 14, y: 276, w: 182, h: 6, z: 1, showIf: 'bankAccount',
        text: 'Bank account / Nr konta: {{bank_account}}', fontFamily: 'LiberationSans', fontSize: 8.5, bold: false,
        color: '#141414', align: 'left', bg: null,
      },
      {
        id: uid(), type: 'text', x: 14, y: 284, w: 182, h: 5, z: 1,
        text: 'This quotation is issued electronically by MyChinaPal ERP and is valid without signature.',
        fontFamily: 'LiberationSans', fontSize: 7.5, bold: false, color: '#8C8C8C', align: 'left', bg: null,
      },
    ],
  }
}

export function newElement(type) {
  const base = { id: uid(), z: 1 }
  if (type === 'text') return { ...base, type, x: 20, y: 100, w: 80, h: 10, text: 'Nowy tekst', fontFamily: 'LiberationSans', fontSize: 10, bold: false, color: '#141414', align: 'left', bg: null }
  if (type === 'rect') return { ...base, type, x: 20, y: 100, w: 60, h: 20, bg: '#F0F0F0', radius: 1.5, opacity: 1, z: 0 }
  if (type === 'image') return { ...base, type, x: 20, y: 100, w: 40, h: 40, src: 'logo', radius: 0 }
  return null
}
