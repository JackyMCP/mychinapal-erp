import ExcelJS from 'exceljs'
import { fetchAsDataUrl } from './pdf'
import { toNum } from './calc'

// Generator wyceny dla klienta w formacie EXCEL (zastępuje dotychczasowy
// PDF — zob. pivot koncepcji wycen: klient dostaje plik .xlsx, żeby mógł
// sam powiększać zdjęcia produktów, a nie statyczny PDF). Układ: klasyczna
// tabela pozycji (Lp./Zdjęcie/Produkt/Ilość/Cena netto za szt./Wartość netto)
// — zdjęcie jest osadzone w komórce w rozsądnym rozmiarze, ale to zwykły
// obiekt graficzny Excela, więc klient może go complete ręcznie powiększyć
// (przeciągnięcie za róg), dokładnie jak prosił. Ten sam branding co
// dotychczasowy PDF/podgląd HTML (docTemplate.js): logo, dane sprzedawcy/
// nabywcy, numer/data wyceny, warunki, nr konta — TYLKO cena końcowa netto/
// VAT/brutto w PLN, bez rozbicia na koszt towaru/transport/cło/marżę
// (to zostaje wyłącznie w widoku wewnętrznym zespołu PL/CN).
export async function loadLogoNavyDataUrl() {
  return fetchAsDataUrl('/logo-navy.png')
}

const NAVY_ARGB = 'FF0A1628'
const GOLD_ARGB = 'FFB48C28'
const MUTED_ARGB = 'FF64748B'
const BORDER_ARGB = 'FFE5E7EB'
const BG_SOFT_ARGB = 'FFF7F8FA'

function dataUrlExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif)/i.exec(dataUrl || '')
  if (!m) return 'jpeg'
  return m[1].toLowerCase().replace('jpg', 'jpeg')
}

const thinBorder = { style: 'thin', color: { argb: BORDER_ARGB } }

/**
 * Buduje ExcelJS.Workbook z pełną, brandowaną wyceną dla klienta.
 * @param {object} params - te same dane co renderQuoteDocHtml (docTemplate.js):
 *   quote, client, contact, company, rows (z totalsCalc.rows), totals (z totalsCalc.totals),
 *   photoDataUrls: { [rowKey]: [dataUrl, ...] } — pierwsze zdjęcie = okładka pozycji,
 *   logoDataUrl (najlepiej logo-navy — jasne tło arkusza), notes (tekst warunków).
 */
export async function buildClientQuoteWorkbook({ quote, client, contact, company, rows, totals, photoDataUrls = {}, logoDataUrl, notes }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = company?.company_name || 'MyChinaPal Sp. z o.o.'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Wycena', {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })
  sheet.columns = [
    { width: 5 },   // A: Lp.
    { width: 20 },  // B: Zdjęcie
    { width: 46 },  // C: Produkt (nazwa + specyfikacja)
    { width: 10 },  // D: Ilość
    { width: 12 },  // E: Jednostka
    { width: 18 },  // F: Cena netto/szt.
    { width: 18 },  // G: Wartość netto
  ]

  let r = 1

  // --- Nagłówek: logo + tytuł/numer wyceny ---
  sheet.mergeCells(`A${r}:D${r + 2}`)
  if (logoDataUrl) {
    try {
      const imgId = workbook.addImage({ base64: logoDataUrl, extension: dataUrlExtension(logoDataUrl) })
      sheet.addImage(imgId, { tl: { col: 0.1, row: r - 1 + 0.2 }, ext: { width: 170, height: 46 }, editAs: 'oneCell' })
    } catch { /* brak logo nie blokuje generowania pliku */ }
  } else {
    sheet.getCell(`A${r}`).value = company?.company_name || 'MyChinaPal Sp. z o.o.'
    sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 18, bold: true, color: { argb: NAVY_ARGB } }
  }
  sheet.mergeCells(`E${r}:G${r}`)
  sheet.getCell(`E${r}`).value = 'WYCENA'
  sheet.getCell(`E${r}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: GOLD_ARGB } }
  sheet.getCell(`E${r}`).alignment = { horizontal: 'right' }
  sheet.mergeCells(`E${r + 1}:G${r + 1}`)
  sheet.getCell(`E${r + 1}`).value = quote?.quote_number || ''
  sheet.getCell(`E${r + 1}`).font = { name: 'Calibri', size: 16, bold: true, color: { argb: NAVY_ARGB } }
  sheet.getCell(`E${r + 1}`).alignment = { horizontal: 'right' }
  sheet.mergeCells(`E${r + 2}:G${r + 2}`)
  const dateParts = []
  if (quote?.created_at) dateParts.push(`Data: ${new Date(quote.created_at).toLocaleDateString('pl-PL')}`)
  if (quote?.valid_until) dateParts.push(`Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}`)
  sheet.getCell(`E${r + 2}`).value = dateParts.join('   ·   ')
  sheet.getCell(`E${r + 2}`).font = { name: 'Calibri', size: 9.5, color: { argb: MUTED_ARGB } }
  sheet.getCell(`E${r + 2}`).alignment = { horizontal: 'right' }
  sheet.getRow(r).height = 20
  sheet.getRow(r + 1).height = 20
  sheet.getRow(r + 2).height = 18
  r += 4

  // --- Sprzedawca / Nabywca ---
  const sellerLines = [
    company?.company_name || 'MyChinaPal Sp. z o.o.',
    company?.company_address || '',
    company?.company_nip ? `NIP: ${company.company_nip}` : '',
    company?.company_krs ? `KRS: ${company.company_krs}` : '',
    company?.company_regon ? `REGON: ${company.company_regon}` : '',
  ].filter(Boolean)
  const buyerLines = [
    client?.full_name || client?.name || '',
    client?.address || '',
    client?.nip ? `NIP: ${client.nip}` : '',
    client?.krs ? `KRS: ${client.krs}` : '',
    contact?.email || '',
    contact?.phone || '',
  ].filter(Boolean)

  sheet.mergeCells(`A${r}:C${r}`)
  sheet.getCell(`A${r}`).value = 'SPRZEDAWCA'
  sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: NAVY_ARGB } }
  sheet.mergeCells(`E${r}:G${r}`)
  sheet.getCell(`E${r}`).value = 'NABYWCA'
  sheet.getCell(`E${r}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: NAVY_ARGB } }
  r += 1
  const maxLines = Math.max(sellerLines.length, buyerLines.length, 1)
  for (let i = 0; i < maxLines; i++) {
    sheet.mergeCells(`A${r}:C${r}`)
    sheet.getCell(`A${r}`).value = sellerLines[i] || ''
    sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 10, bold: i === 0, color: { argb: i === 0 ? 'FF141414' : MUTED_ARGB } }
    sheet.mergeCells(`E${r}:G${r}`)
    sheet.getCell(`E${r}`).value = buyerLines[i] || ''
    sheet.getCell(`E${r}`).font = { name: 'Calibri', size: 10, bold: i === 0, color: { argb: i === 0 ? 'FF141414' : MUTED_ARGB } }
    r += 1
  }
  r += 1

  // --- Nagłówek tabeli pozycji ---
  const headerRow = r
  const headers = ['Lp.', 'Zdjęcie', 'Produkt', 'Ilość', 'Jednostka', 'Cena netto / szt. (PLN)', 'Wartość netto (PLN)']
  headers.forEach((h, i) => {
    const cell = sheet.getRow(headerRow).getCell(i + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'center' : 'left', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } }
  })
  sheet.getRow(headerRow).height = 22
  r += 1

  // --- Wiersze pozycji ---
  const PHOTO_PX = 110
  const ROW_HEIGHT_PT = 92 // ~123px przy 96dpi — z zapasem na obramowanie

  for (const row of rows) {
    const rowIdx = r
    const photos = photoDataUrls[row._key] || []
    const cover = photos[0]
    const qtyNum = toNum(row.qty)
    const unitNetto = qtyNum > 0 ? row.finalPrice / qtyNum : row.finalPrice

    sheet.getRow(rowIdx).height = ROW_HEIGHT_PT

    const lpCell = sheet.getCell(rowIdx, 1)
    lpCell.value = rows.indexOf(row) + 1
    lpCell.alignment = { vertical: 'middle', horizontal: 'center' }
    lpCell.font = { name: 'Calibri', size: 10, color: { argb: MUTED_ARGB } }

    if (cover) {
      try {
        const imgId = workbook.addImage({ base64: cover, extension: dataUrlExtension(cover) })
        // editAs:'oneCell' — obraz trzyma swój rozmiar i pozycję względem
        // komórki, ale klient może go w Excelu złapać za róg i ręcznie
        // powiększyć (to był wyraźnie zgłoszony wymóg: zdjęcia "skalowalne").
        sheet.addImage(imgId, { tl: { col: 1.05, row: rowIdx - 1 + 0.08 }, ext: { width: PHOTO_PX, height: PHOTO_PX }, editAs: 'oneCell' })
      } catch { /* brakujące/niepoprawne zdjęcie nie blokuje reszty wyceny */ }
    }

    const nameCell = sheet.getCell(rowIdx, 3)
    const specText = row.specification ? `\n${row.specification}` : ''
    nameCell.value = `${row.name || '—'}${specText}`
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    nameCell.font = { name: 'Calibri', size: 10 }

    const qtyCell = sheet.getCell(rowIdx, 4)
    qtyCell.value = qtyNum
    qtyCell.alignment = { vertical: 'middle', horizontal: 'center' }
    qtyCell.font = { name: 'Calibri', size: 10 }

    const unitCell = sheet.getCell(rowIdx, 5)
    unitCell.value = row.unit || ''
    unitCell.alignment = { vertical: 'middle', horizontal: 'center' }
    unitCell.font = { name: 'Calibri', size: 10, color: { argb: MUTED_ARGB } }

    const unitPriceCell = sheet.getCell(rowIdx, 6)
    unitPriceCell.value = Number(unitNetto.toFixed(2))
    unitPriceCell.numFmt = '#,##0.00'
    unitPriceCell.alignment = { vertical: 'middle', horizontal: 'right' }
    unitPriceCell.font = { name: 'Calibri', size: 10 }

    const totalCell = sheet.getCell(rowIdx, 7)
    totalCell.value = Number((row.finalPrice || 0).toFixed(2))
    totalCell.numFmt = '#,##0.00'
    totalCell.alignment = { vertical: 'middle', horizontal: 'right' }
    totalCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: GOLD_ARGB } }

    for (let c = 1; c <= 7; c++) {
      sheet.getCell(rowIdx, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
      if (rowIdx % 2 === 0) {
        sheet.getCell(rowIdx, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_SOFT_ARGB } }
      }
    }

    r += 1
  }

  // --- Podsumowanie (Netto / VAT / Brutto) ---
  r += 1
  const summaryRows = []
  if (totals.totalCbm > 0) summaryRows.push(['Całkowita objętość zamówienia', `${totals.totalCbm.toFixed(2)} m³`, false])
  summaryRows.push(['Netto', `${totals.finalPrice.toFixed(2)} PLN`, false])
  summaryRows.push(['VAT (23%)', `${totals.vatAmount.toFixed(2)} PLN`, false])
  summaryRows.push(['RAZEM BRUTTO', `${totals.finalPriceGross.toFixed(2)} PLN`, true])

  for (const [label, value, emphasize] of summaryRows) {
    sheet.mergeCells(`E${r}:F${r}`)
    sheet.getCell(`E${r}`).value = label
    sheet.getCell(`E${r}`).alignment = { horizontal: 'right' }
    sheet.getCell(`E${r}`).font = { name: 'Calibri', size: emphasize ? 12 : 10, bold: emphasize, color: { argb: emphasize ? 'FFFFFFFF' : 'FF141414' } }
    sheet.getCell(`G${r}`).value = value
    sheet.getCell(`G${r}`).alignment = { horizontal: 'right' }
    sheet.getCell(`G${r}`).font = { name: 'Calibri', size: emphasize ? 13 : 10, bold: true, color: { argb: emphasize ? 'FFFFFFFF' : GOLD_ARGB } }
    if (emphasize) {
      sheet.getCell(`E${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } }
      sheet.getCell(`F${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } }
      sheet.getCell(`G${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } }
    }
    sheet.getRow(r).height = emphasize ? 24 : 18
    r += 1
  }
  r += 1

  // --- Warunki / notatki ---
  if (notes) {
    sheet.mergeCells(`A${r}:G${r}`)
    sheet.getCell(`A${r}`).value = 'Warunki'
    sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: NAVY_ARGB } }
    r += 1
    sheet.mergeCells(`A${r}:G${r + 3}`)
    sheet.getCell(`A${r}`).value = notes
    sheet.getCell(`A${r}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF141414' } }
    sheet.getRow(r).height = 60
    r += 4
  }

  // --- Stopka: nr konta + zastrzeżenie ---
  r += 1
  sheet.mergeCells(`A${r}:D${r}`)
  sheet.getCell(`A${r}`).value = company?.company_bank_account ? `Nr konta: ${company.company_bank_account}` : ''
  sheet.getCell(`A${r}`).font = { name: 'Calibri', size: 8.5, color: { argb: MUTED_ARGB } }
  sheet.mergeCells(`E${r}:G${r}`)
  sheet.getCell(`E${r}`).value = 'Wycena wystawiona elektronicznie — ważna bez podpisu.'
  sheet.getCell(`E${r}`).alignment = { horizontal: 'right' }
  sheet.getCell(`E${r}`).font = { name: 'Calibri', size: 8, italic: true, color: { argb: MUTED_ARGB } }

  return workbook
}

export async function exportQuoteToExcelBlob(params) {
  const workbook = await buildClientQuoteWorkbook(params)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
