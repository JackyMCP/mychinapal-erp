import * as XLSX from 'xlsx'
import { toNum } from './calc'

// Import "najlepszego wysiłku" z wyceny fabrycznej w Excelu (format widziany
// w praktyce: Nr. / Picture / Name / Specification / QTY（set）/ EXW Unit
// Price（CNY/set）/ EXW Total Price（CNY）/ Volume（CBM）/ EXW Add.). Fabryki
// różnią się formatem, więc dopasowujemy nagłówki "na wyczucie" (małe litery,
// bez nawiasów/spacji) zamiast wymagać identycznych kolumn — a i tak zawsze
// wynik trzeba ręcznie sprawdzić/uzupełnić przed wysłaniem.
function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[（(].*?[）)]/g, '').replace(/[^a-z]/g, '')
}

const HEADER_MAP = {
  name: 'name', productname: 'name', 品名: 'name',
  specification: 'specification', spec: 'specification', description: 'specification', desc: 'specification',
  qty: 'qty', quantity: 'qty',
  exwunitprice: 'unit_price_cny', unitprice: 'unit_price_cny', price: 'unit_price_cny',
  volume: 'cbm', cbm: 'cbm',
  exwadd: 'container_note', address: 'container_note',
}

// Zdjęcia osadzone w Excelu (kolumna "Picture" itp.) nie są zwykłymi
// wartościami komórek — to osobne obiekty graficzne "przyklejone" do
// konkretnego wiersza/kolumny (anchor). Pakiet `xlsx` (SheetJS, wersja OSS)
// używany do odczytu wartości komórek NIE potrafi ich wyciągnąć. Używamy
// do tego dodatkowo `exceljs`, które wystawia ws.getImages() + surowe bajty
// obrazu (workbook.model.media) — i tylko do tego, żeby nie dublować dwóch
// bibliotek do parsowania samych wartości.
async function extractRowImages(buf, sheetStartRow0) {
  const byRowIdx = {}
  try {
    // Import dynamiczny — `exceljs` jest ciężką biblioteką (~1MB), a potrzebna
    // jest wyłącznie tutaj, przy imporcie z Excela. Dzięki temu nie obciąża
    // głównego bundla ładowanego przy każdym wejściu w aplikację.
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws) return byRowIdx
    const images = ws.getImages ? ws.getImages() : []
    for (const img of images) {
      const media = wb.model?.media?.[img.imageId]
      if (!media?.buffer) continue
      // ExcelJS podaje pozycję kotwicy jako ułamkową pozycję wiersza (0-indeksowaną,
      // np. 2.0457 = "trochę poniżej górnej krawędzi wiersza 3" w Excelu). Zaokrąglamy
      // w dół do pełnego wiersza i sprowadzamy do tej samej bazy co tablica `rows`
      // z XLSX.utils.sheet_to_json (która zaczyna się od pierwszego wiersza w
      // zakresie arkusza, nie zawsze od wiersza 1).
      const rowIdx = Math.floor(img.range?.tl?.row ?? -1) - sheetStartRow0
      if (rowIdx < 0) continue
      const ext = String(media.extension || 'png').toLowerCase()
      const mime = ext === 'jpg' ? 'jpeg' : ext
      if (!['png', 'jpeg', 'gif', 'webp', 'bmp'].includes(mime)) continue
      const dataUrl = `data:image/${mime};base64,${arrayBufferToBase64(media.buffer)}`
      if (!byRowIdx[rowIdx]) byRowIdx[rowIdx] = []
      byRowIdx[rowIdx].push(dataUrl)
    }
  } catch {
    // Najlepszy wysiłek — jeśli struktura pliku jest nietypowa i nie da się
    // wyciągnąć zdjęć, import samych danych (nazwa/ilość/cena) i tak ma zadziałać.
  }
  return byRowIdx
}

function arrayBufferToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function parseQuoteExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const sheetStartRow0 = range.s.r

  // Zdjęcia trzeba wyciągnąć z osobnej kopii bufora (ExcelJS konsumuje/czyta
  // go niezależnie od SheetJS) — dopasowywane do wierszy przez pozycję kotwicy.
  const imagesByRowIdx = await extractRowImages(buf.slice(0), sheetStartRow0)

  // Znajdź wiersz nagłówka — pierwszy, który ma komórkę pasującą do "name"/"品名".
  let headerRowIdx = rows.findIndex(r => r.some(c => normalizeHeader(c) === 'name' || normalizeHeader(c).includes('品名')))
  if (headerRowIdx === -1) headerRowIdx = 0
  const headerRow = rows[headerRowIdx]
  const colMap = {} // colIndex -> our field key
  headerRow.forEach((h, i) => {
    const norm = normalizeHeader(h)
    if (HEADER_MAP[norm]) colMap[i] = HEADER_MAP[norm]
  })

  const items = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue
    const item = { name: '', specification: '', qty: 1, unit: 'set', unit_price_cny: 0, cbm: '', container_note: '' }
    let hasName = false
    for (const [colIdx, field] of Object.entries(colMap)) {
      const val = row[Number(colIdx)]
      if (val === '' || val === null || val === undefined) continue
      // Komórki bywają liczbami (Excel) albo tekstem z przecinkiem jako
      // separatorem dziesiętnym (np. "2,7") — zamieniamy przecinek na kropkę
      // przed parsowaniem, żeby Number() nie zwracał po cichu NaN/0.
      const asNumber = (v) => {
        const s = String(v ?? '').trim().replace(',', '.')
        return s === '' ? NaN : Number(s)
      }
      if (field === 'qty' || field === 'unit_price_cny') item[field] = toNum(val)
      else if (field === 'cbm') { const n = asNumber(val); item.cbm = Number.isNaN(n) ? '' : n; if (Number.isNaN(n)) item.container_note = String(val) }
      else item[field] = String(val)
      if (field === 'name' && item.name) hasName = true
    }
    // Wiersze bez nazwy to zwykle podsumowania/stopki — pomijamy je, chyba że
    // wiersz ma za to zdjęcie (produkt bez opisanej nazwy w Excelu, ale z
    // fotką — i tak warto go zaimportować, nazwę można dopisać/dogenerować AI).
    const rowImages = imagesByRowIdx[r] || []
    if (hasName || rowImages.length) {
      if (rowImages.length) item._photoDataUrls = rowImages
      items.push(item)
    }
  }
  return items
}
