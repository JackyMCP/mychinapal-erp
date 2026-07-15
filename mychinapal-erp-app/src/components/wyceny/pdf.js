import jsPDF from 'jspdf'

const navy = [10, 22, 40]
const gold = [180, 140, 40]

async function fetchAsDataUrl(url) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
  } catch { return null }
}

// Generuje branded PDF wyceny dla klienta — wyłącznie cena końcowa (bez
// rozbicia na koszt towaru/transport/cło/marżę, które widzi tylko zespół
// wewnętrzny w aplikacji). Wzorowane na istniejącym generatorze faktur
// (jsPDF + autotable, granatowo-złoty branding MyChinaPal).
export async function generateQuotePdf({ quote, client, contact, company, rows, totals, photoDataUrls = {}, auxPrice = null }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 14
  const right = 196

  const logo = await fetchAsDataUrl('/logo-white.png')

  doc.setFillColor(...navy)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.8)
  doc.line(0, 28, 210, 28)
  if (logo) {
    try { doc.addImage(logo, 'PNG', left, 6, 40, 16, undefined, 'FAST') } catch { /* ignore malformed image */ }
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('QUOTATION / WYCENA', right, 12, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gold)
  doc.text(String(quote.quote_number || ''), right, 19, { align: 'right' })

  doc.setTextColor(20, 20, 20)
  let y = 38

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Date / Data: ${quote.created_at ? new Date(quote.created_at).toLocaleDateString('pl-PL') : ''}`, left, y)
  if (quote.valid_until) doc.text(`Valid until / Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}`, 120, y)
  y += 8

  const colW = 90
  doc.setFillColor(245, 246, 248)
  doc.rect(left, y - 4, colW - 4, 32, 'F')
  doc.rect(left + colW, y - 4, colW - 4, 32, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('SELLER / SPRZEDAWCA', left + 2, y)
  doc.text('BUYER / NABYWCA', left + colW + 2, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
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
  const maxLines = Math.max(sellerLines.length, buyerLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) doc.text(doc.splitTextToSize(sellerLines[i], colW - 8), left + 2, y)
    if (buyerLines[i]) doc.text(doc.splitTextToSize(buyerLines[i], colW - 8), left + colW + 2, y)
    y += 4.2
  }
  y += 8

  // Pozycje towaru — każda jako osobny blok z DUŻYM zdjęciem (to wycena, którą
  // ogląda klient, więc zdjęcie produktu ma być czytelne, nie ledwo widoczna
  // miniatura) + nazwą, specyfikacją, ilością i ceną końcową (bez rozbicia na
  // marżę/koszt/cło — to widzi tylko zespół wewnętrzny w aplikacji).
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text('ITEMS / POZYCJE TOWARU', left, y)
  doc.setTextColor(20, 20, 20)
  y += 6

  const photoSize = 42
  const pageBottom = 278

  for (const r of rows) {
    const specLines = r.specification ? doc.splitTextToSize(r.specification, right - left - photoSize - 14) : []
    const blockHeight = Math.max(photoSize + 6, 16 + specLines.length * 4 + 14)

    if (y + blockHeight > pageBottom) { doc.addPage(); y = 20 }

    doc.setDrawColor(225, 227, 231)
    doc.setLineWidth(0.3)
    doc.rect(left, y, right - left, blockHeight)

    const img = photoDataUrls[r._key]
    if (img) {
      try { doc.addImage(img, 'JPEG', left + 3, y + 3, photoSize, photoSize, undefined, 'FAST') } catch { /* ignore malformed image */ }
    } else {
      doc.setDrawColor(215, 215, 215)
      doc.setLineWidth(0.3)
      doc.rect(left + 3, y + 3, photoSize, photoSize)
    }

    const textX = left + photoSize + 10
    let ty = y + 7
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(20, 20, 20)
    doc.text(r.name || '—', textX, ty)
    ty += 5.5

    if (specLines.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(100, 100, 100)
      doc.text(specLines, textX, ty)
      ty += specLines.length * 4
      doc.setTextColor(20, 20, 20)
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const metaBits = [`Qty / Ilość: ${r.qty} ${r.unit || ''}`]
    if (r.production_days) metaBits.push(`Production / Produkcja: ${r.production_days} d`)
    if (r.cbm) metaBits.push(`CBM: ${r.cbm} m³`)
    else if (r.container_note) metaBits.push(r.container_note)
    doc.text(metaBits.join('   ·   '), textX, y + blockHeight - 14)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...gold)
    doc.text(`${Number(r.finalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quote.currency || 'CNY'}`, right - 3, y + blockHeight - 6, { align: 'right' })
    doc.setTextColor(20, 20, 20)

    y += blockHeight + 4
  }

  if (y > 265) { doc.addPage(); y = 20 }
  y += 4
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.4)
  doc.line(left, y, right, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('TOTAL / RAZEM:', left, y)
  doc.setTextColor(...gold)
  doc.text(`${Number(totals.finalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quote.currency || 'CNY'}`, right, y, { align: 'right' })
  doc.setTextColor(20, 20, 20)
  y += 6

  if (auxPrice && auxPrice.amount) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const locale = auxPrice.currency === 'PLN' ? 'pl-PL' : 'en-US'
    const amt = Number(auxPrice.amount).toLocaleString(locale, { minimumFractionDigits: 2 })
    doc.text(`(≈ ${amt} ${auxPrice.currency}${auxPrice.note ? ', ' + auxPrice.note : ''})`, right, y, { align: 'right' })
    y += 6
  }
  y += 6

  if (quote.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Explanation / Objaśnienia:', left, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(quote.notes, right - left)
    doc.text(lines, left, y)
    y += lines.length * 3.6 + 6
  }

  if (company?.company_bank_account) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`Bank account / Nr konta: ${company.company_bank_account}`, left, Math.min(y, 280))
  }

  doc.setFontSize(7.5)
  doc.setTextColor(140, 140, 140)
  doc.text('This quotation is issued electronically by MyChinaPal ERP and is valid without signature.', left, 290)

  return doc.output('blob')
}
