import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
export async function generateQuotePdf({ quote, client, contact, company, rows, totals, photoDataUrls = {}, plnInfo = null }) {
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

  // Tabela pozycji — miniatura zdjęcia (jeśli jest), nazwa+specyfikacja, ilość,
  // czas produkcji, TYLKO cena końcowa (bez marży/kosztu/cła osobno).
  const photoCol = 18
  const body = rows.map((r) => [
    '', `${r.name || ''}${r.specification ? `\n${r.specification}` : ''}`,
    `${r.qty} ${r.unit || ''}`, r.production_days ? `${r.production_days} d` : '—',
    r.cbm ? `${r.cbm} m³` : (r.container_note || '—'),
    `${Number(r.finalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quote.currency || 'CNY'}`,
  ])

  autoTable(doc, {
    startY: y,
    head: [['Photo', 'Product / Towar', 'Qty', 'Production time', 'CBM / Container', `Price / Cena (${quote.currency || 'CNY'})`]],
    body,
    styles: { fontSize: 8, cellPadding: 2.4, minCellHeight: photoCol + 4, valign: 'middle' },
    headStyles: { fillColor: navy, textColor: 255 },
    columnStyles: { 0: { cellWidth: photoCol + 6 }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 26, halign: 'center' }, 4: { cellWidth: 30, halign: 'center' }, 5: { cellWidth: 34, halign: 'right' } },
    didDrawCell: (data) => {
      if (data.column.index === 0 && data.row.section === 'body') {
        const r = rows[data.row.index]
        const img = r && photoDataUrls[r._key]
        if (img) {
          try { doc.addImage(img, 'JPEG', data.cell.x + 2, data.cell.y + 2, photoCol, photoCol, undefined, 'FAST') } catch { /* ignore */ }
        }
      }
    },
  })

  y = doc.lastAutoTable.finalY + 8
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

  if (plnInfo && plnInfo.plnAmount) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`(≈ ${plnInfo.plnAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN, kurs orientacyjny NBP+prowizja banku)`, right, y, { align: 'right' })
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
