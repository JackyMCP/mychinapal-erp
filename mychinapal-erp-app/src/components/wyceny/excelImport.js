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
  specification: 'specification', spec: 'specification',
  qty: 'qty', quantity: 'qty',
  exwunitprice: 'unit_price_cny', unitprice: 'unit_price_cny', price: 'unit_price_cny',
  volume: 'cbm', cbm: 'cbm',
  exwadd: 'container_note', address: 'container_note',
}

export async function parseQuoteExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

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
    // Wiersze bez nazwy to zwykle podsumowania/stopki — pomijamy je.
    if (hasName) items.push(item)
  }
  return items
}
