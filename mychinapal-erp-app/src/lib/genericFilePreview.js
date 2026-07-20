// Parsowanie plików do podglądu W APLIKACJI (bez pobierania na dysk) — używane
// przez FilePreviewModal.jsx. Biblioteki (`xlsx`, `mammoth`) są ciężkie, więc
// importowane dynamicznie — wczytują się tylko, gdy naprawdę otwierany jest
// plik danego typu, nie przy każdym starcie aplikacji.

const MAX_ROWS = 300
const MAX_COLS = 40

// Excel (.xlsx/.xls/.xlsm/.csv) -> surowa siatka wartości per arkusz, do
// wyświetlenia jako zwykła tabela (bez żadnego mapowania na konkretne kolumny
// biznesowe — to NIE jest to samo co parseQuoteExcel w wyceny/excelImport.js,
// które rozpoznaje konkretne nagłówki Ilość/Cena; tu chodzi o pokazanie
// DOWOLNEGO arkusza tak, jak wygląda).
export async function parseExcelGeneric(blob) {
  const buf = await blob.arrayBuffer()
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name]
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
    const totalRows = grid.length
    const totalCols = grid.reduce((m, r) => Math.max(m, r.length), 0)
    const rows = grid.slice(0, MAX_ROWS).map(r => r.slice(0, MAX_COLS).map(c => (c === null || c === undefined) ? '' : String(c)))
    return {
      name,
      rows,
      totalRows,
      totalCols,
      truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
    }
  })
}

// Word (.docx) -> HTML do wyświetlenia jak strona dokumentu. Mammoth NIE
// obsługuje starego binarnego formatu .doc (Word 97-2003) — dla niego wyżej
// (w FilePreviewModal) pokazujemy zwykły fallback z Pobierz.
export async function parseDocx(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const mod = await import('mammoth')
  // `mammoth` to paczka CJS — w zależności od tego jak bundler ją opakuje,
  // convertToHtml może wylądować na module.default albo bezpośrednio na module.
  const mammoth = mod.convertToHtml ? mod : (mod.default || mod)
  const result = await mammoth.convertToHtml({ arrayBuffer })
  return result.value
}
