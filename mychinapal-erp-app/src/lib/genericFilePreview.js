// Parsowanie plików do podglądu W APLIKACJI (bez pobierania na dysk) — używane
// przez FilePreviewModal.jsx. Biblioteki (`xlsx`, `exceljs`, `mammoth`) są
// ciężkie, więc importowane dynamicznie — wczytują się tylko, gdy naprawdę
// otwierany jest plik danego typu, nie przy każdym starcie aplikacji.

const MAX_ROWS = 300
const MAX_COLS = 40

// Wszystkie ścieżki (pełna wierność i uproszczony fallback) zwracają TEN SAM
// znormalizowany kształt, żeby FilePreviewModal.jsx miał jeden kod renderujący:
// { name, colWidths:[px...], rows:[{height, cells:[{value,col,colSpan,rowSpan,
//   bold,italic,underline,strike,size,color,bg,align,valign,wrap,
//   borderTop/Right/Bottom/Left, image}]}], totalRows, totalCols, truncated }

function colLetter(n) {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function argbToCss(argb) {
  if (!argb) return null
  const hex = argb.length === 8 ? argb.slice(2) : argb
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return '#' + hex
}

const BORDER_STYLE_MAP = {
  thin: '1px solid', hair: '1px solid', dotted: '1px dotted',
  dashed: '1px dashed', mediumDashed: '1.4px dashed',
  medium: '2px solid', thick: '2.4px solid', double: '3px double',
  dashDot: '1px dashed', mediumDashDot: '1.4px dashed',
  dashDotDot: '1px dashed', mediumDashDotDot: '1.4px dashed',
  slantDashDot: '1px dashed',
}
function borderCss(side) {
  if (!side || !side.style) return null
  const color = argbToCss(side.color?.argb) || '#000000'
  return `${BORDER_STYLE_MAP[side.style] || '1px solid'} ${color}`
}

function arrayBufferToBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Odczytuje surową wartość komórki respektując format liczbowy Excela
// (procenty, separator tysięcy) i typowe przypadki (daty, formuły, rich text)
// — najlepszy wysiłek, nie pełny silnik formatowania Excela.
function formatCellValue(cell) {
  let v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('')
    if (v.result !== undefined) v = v.result
    else if (v.text !== undefined) return String(v.text) // hyperlink {text, hyperlink}
    else if (v.error !== undefined) return '#' + v.error
  }
  if (v instanceof Date) {
    return v.toLocaleDateString('pl-PL')
  }
  if (typeof v === 'number') {
    const fmt = cell.numFmt || 'General'
    if (fmt.includes('%')) {
      const decMatch = fmt.match(/0\.(0+)%/)
      const dec = decMatch ? decMatch[1].length : 0
      return (v * 100).toFixed(dec) + '%'
    }
    if (/#,##0/.test(fmt)) {
      const decMatch = fmt.match(/\.(0+)/)
      const dec = decMatch ? decMatch[1].length : 0
      return v.toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    }
    return String(v)
  }
  return String(v)
}

// Wyciąga obrazki (np. zdjęcia produktów w kolumnie "Picture") i przypisuje
// każdy do najbliższej komórki (środek zakresu kotwiczenia zaokrąglony do
// najbliższego wiersza/kolumny — ta sama technika co w wyceny/excelImport.js).
function extractImages(wb, ws) {
  const out = []
  try {
    const images = ws.getImages ? ws.getImages() : []
    for (const img of images) {
      const media = wb.model?.media?.[img.imageId]
      if (!media?.buffer) continue
      const tl = img.range?.tl, br = img.range?.br
      if (!tl) continue
      const centerRow = br ? (tl.row + br.row) / 2 : tl.row
      const centerCol = br ? (tl.col + br.col) / 2 : tl.col
      const row = Math.round(centerRow) + 1
      const col = Math.round(centerCol) + 1
      const ext = String(media.extension || 'png').toLowerCase()
      const mime = ext === 'jpg' ? 'jpeg' : ext
      if (!['png', 'jpeg', 'gif', 'webp', 'bmp'].includes(mime)) continue
      out.push({ row, col, dataUrl: `data:image/${mime};base64,${arrayBufferToBase64(media.buffer)}` })
    }
  } catch { /* najlepszy wysiłek — brak obrazków nie blokuje podglądu danych */ }
  return out
}

// Pełna wierność formatowaniu dla współczesnych .xlsx/.xlsm — czcionka
// (pogrubienie/kursywa/podkreślenie/rozmiar/kolor), tło komórki, obramowania,
// wyrównanie, zawijanie tekstu, scalone komórki i szerokości kolumn — dokładnie
// tak, jak wygląda oryginalny plik. Biblioteka `exceljs` (już używana w
// wyceny/excelImport.js) w przeciwieństwie do `xlsx` (SheetJS Community)
// faktycznie parsuje pełny styl komórek, nie tylko wypełnienie.
async function parseExcelWithStyles(buf) {
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb.worksheets.map(ws => {
    const totalRows = ws.rowCount
    const totalCols = ws.columnCount
    const capRows = Math.min(totalRows, MAX_ROWS)
    const capCols = Math.min(totalCols, MAX_COLS)

    const colWidths = []
    for (let c = 1; c <= capCols; c++) {
      const w = ws.getColumn(c).width
      colWidths.push(Math.round((w || 8.43) * 7 + 5))
    }

    // Scalone komórki: lewa-górna dostaje colSpan/rowSpan, reszta zakresu jest
    // pomijana przy renderowaniu (standardowy sposób budowania <table> z HTML).
    const mergeSpan = new Map()
    const mergeSkip = new Set()
    const colToNum = (s) => s.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0)
    for (const range of (ws.model.merges || [])) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
      if (!m) continue
      const c1 = colToNum(m[1]), r1 = parseInt(m[2], 10), c2 = colToNum(m[3]), r2 = parseInt(m[4], 10)
      mergeSpan.set(`${r1},${c1}`, { rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 })
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue
        mergeSkip.add(`${r},${c}`)
      }
    }

    const images = extractImages(wb, ws)
    const usedImages = new Set()

    const rows = []
    for (let r = 1; r <= capRows; r++) {
      const row = ws.getRow(r)
      const rowHeight = row.height ? Math.max(20, Math.round(row.height * 1.333)) : null
      const cells = []
      for (let c = 1; c <= capCols; c++) {
        const key = `${r},${c}`
        if (mergeSkip.has(key)) continue
        const cell = row.getCell(c)
        const span = mergeSpan.get(key)
        const colSpan = Math.min(span?.colSpan || 1, capCols - c + 1)
        const rowSpan = Math.min(span?.rowSpan || 1, capRows - r + 1)
        const font = cell.font || {}
        const fill = cell.fill
        let bg = null
        if (fill && fill.type === 'pattern' && fill.pattern === 'solid' && fill.fgColor) bg = argbToCss(fill.fgColor.argb)
        const align = cell.alignment || {}
        const isNumeric = typeof cell.value === 'number'
        // Obrazek trafia do komórki, jeśli jego zaokrąglona pozycja mieści się
        // w zakresie tej (ew. scalonej) komórki.
        let image = null
        for (let i = 0; i < images.length; i++) {
          if (usedImages.has(i)) continue
          const im = images[i]
          if (im.row >= r && im.row < r + rowSpan && im.col >= c && im.col < c + colSpan) {
            image = im.dataUrl; usedImages.add(i); break
          }
        }
        cells.push({
          value: formatCellValue(cell),
          col: c,
          colSpan,
          rowSpan,
          bold: !!font.bold,
          italic: !!font.italic,
          underline: !!font.underline,
          strike: !!font.strike,
          size: font.size ? Math.max(9, Math.min(20, Math.round(font.size))) : 11,
          color: argbToCss(font.color?.argb),
          bg,
          align: align.horizontal || (isNumeric ? 'right' : 'left'),
          valign: align.vertical === 'middle' ? 'middle' : align.vertical === 'top' ? 'top' : 'bottom',
          wrap: !!align.wrapText,
          borderTop: borderCss(cell.border?.top),
          borderRight: borderCss(cell.border?.right),
          borderBottom: borderCss(cell.border?.bottom),
          borderLeft: borderCss(cell.border?.left),
          image,
        })
      }
      rows.push({ height: rowHeight, cells })
    }

    return {
      name: ws.name,
      colWidths,
      rows,
      totalRows,
      totalCols,
      truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
    }
  })
}

// Fallback bez stylów (dla starego binarnego .xls i .csv, których `exceljs`
// nie potrafi wczytać — obsługuje je tylko `xlsx`/SheetJS) — ten sam
// znormalizowany kształt co wyżej, ale z neutralnym wyglądem (brak
// pogrubień/kolorów, bo w tych formatach i tak rzadko niosą wartościową
// informację, a SheetJS Community i tak ich nie odczytuje).
async function parseExcelPlain(buf) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name]
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
    const totalRows = grid.length
    const totalCols = grid.reduce((m, r) => Math.max(m, r.length), 0)
    const capRows = Math.min(totalRows, MAX_ROWS)
    const capCols = Math.min(totalCols, MAX_COLS)
    const colWidths = []
    for (let c = 0; c < capCols; c++) {
      const maxLen = grid.slice(0, capRows).reduce((m, r) => Math.max(m, String(r[c] ?? '').length), 0)
      colWidths.push(Math.min(260, Math.max(60, maxLen * 7 + 16)))
    }
    const rows = grid.slice(0, capRows).map(r => ({
      height: null,
      cells: r.slice(0, capCols).map((v, ci) => ({
        value: (v === null || v === undefined) ? '' : String(v),
        col: ci + 1, colSpan: 1, rowSpan: 1,
        bold: false, italic: false, underline: false, strike: false,
        size: 11, color: null, bg: null,
        align: (!isNaN(parseFloat(v)) && v !== '' && v !== null) ? 'right' : 'left',
        valign: 'bottom', wrap: false,
        borderTop: null, borderRight: null, borderBottom: null, borderLeft: null,
        image: null,
      })),
    }))
    return { name, colWidths, rows, totalRows, totalCols, truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS }
  })
}

// Excel (.xlsx/.xls/.xlsm/.csv) -> siatka per arkusz do wyświetlenia jak
// prawdziwy plik Excela (kolory, pogrubienia, obramowania, scalone komórki,
// zdjęcia w komórkach) — to NIE jest to samo co parseQuoteExcel w
// wyceny/excelImport.js, które rozpoznaje konkretne nagłówki biznesowe
// (Ilość/Cena); tu chodzi o pokazanie DOWOLNEGO arkusza tak, jak wygląda.
export async function parseExcelGeneric(blob, fileName) {
  const buf = await blob.arrayBuffer()
  if (/\.(xlsx|xlsm)$/i.test(fileName || '')) {
    try {
      return await parseExcelWithStyles(buf)
    } catch (e) {
      console.error('Pełny podgląd Excela nie powiódł się, używam uproszczonego', e)
    }
  }
  return await parseExcelPlain(buf)
}

export function colLetterExport(n) { return colLetter(n) }

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
