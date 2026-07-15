import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { vatRateToNumber } from './utils'

// generuje PDF faktury w pamięci i zwraca Blob (do podglądu / uploadu do storage)
export function generateInvoicePdf({ invoice, items, client, contact, company }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 14
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(`${invoice.typ === 'zaliczkowa' ? 'Faktura zaliczkowa' : invoice.typ === 'pro forma' ? 'Faktura pro forma' : invoice.typ === 'korygująca' ? 'Faktura korygująca' : 'Faktura VAT'} nr ${invoice.number}`, left, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Data wystawienia: ${invoice.invoice_date}    Termin płatności: ${invoice.due_date || '—'}    Forma płatności: ${invoice.payment_method || 'Przelew'}`, left, y)
  y += 10

  const colWidth = 90
  doc.setFont('helvetica', 'bold')
  doc.text('Sprzedawca', left, y)
  doc.text('Nabywca', left + colWidth, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const sellerLines = [
    company?.company_name || 'MyChinaPal Sp. z o.o.',
    company?.company_address || '',
    company?.company_nip ? `NIP: ${company.company_nip}` : '',
  ].filter(Boolean)
  const buyerLines = [
    client?.full_name || client?.name || '',
    client?.address || '',
    client?.nip ? `NIP: ${client.nip}` : '',
    contact?.email || '',
  ].filter(Boolean)
  const maxLines = Math.max(sellerLines.length, buyerLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) doc.text(sellerLines[i], left, y)
    if (buyerLines[i]) doc.text(buyerLines[i], left + colWidth, y)
    y += 4.5
  }
  y += 6

  const rows = items.map((it, i) => {
    const net = (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0)
    const vat = net * vatRateToNumber(it.vat_rate)
    return [
      i + 1, it.description, `${it.quantity} ${it.unit}`,
      `${Number(it.unit_price_net).toFixed(2)}`, it.vat_rate,
      `${net.toFixed(2)}`, `${vat.toFixed(2)}`, `${(net + vat).toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Lp', 'Nazwa', 'Ilość', 'Cena netto', 'VAT', 'Netto', 'VAT', 'Brutto']],
    body: rows,
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [10, 22, 40] },
  })

  y = doc.lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Razem netto: ${invoice.subtotal_net?.toFixed ? invoice.subtotal_net.toFixed(2) : invoice.subtotal_net} ${invoice.currency}`, left, y)
  y += 5
  doc.text(`Razem VAT: ${invoice.vat_total?.toFixed ? invoice.vat_total.toFixed(2) : invoice.vat_total} ${invoice.currency}`, left, y)
  y += 5
  doc.setFontSize(12)
  doc.text(`Do zapłaty: ${invoice.total_gross?.toFixed ? invoice.total_gross.toFixed(2) : invoice.total_gross} ${invoice.currency}`, left, y)

  if (company?.company_bank_account) {
    y += 10
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Nr konta: ${company.company_bank_account}`, left, y)
  }

  return doc.output('blob')
}

// Faktura chińskiej spółki / faktura wspólna PL-CN, w stylu międzynarodowej
// "COMMERCIAL INVOICE" — układ i pola wzorowane 1:1 na realnej fakturze
// eksportowej (sprzedawca w Chinach, nabywca w Polsce, dwujęzyczne pozycje
// towarowe, warunki dostawy/transportu, wartości w CNY).
export function generateCommercialInvoicePdf({ invoice, items, client, cnCompany, docType = 'CI' }) {
  const isProforma = docType === 'PI'
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 14
  const right = 196
  const navy = [10, 22, 40]
  const gold = [180, 140, 40]

  // Pasek nagłówkowy — "twardy", firmowy, bez fajerwerków.
  doc.setFillColor(...navy)
  doc.rect(0, 0, 210, 26, 'F')
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.8)
  doc.line(0, 26, 210, 26)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(isProforma ? 'PROFORMA INVOICE' : 'COMMERCIAL INVOICE', left, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('MyChinaPal Group', right, 12, { align: 'right' })
  doc.setTextColor(...gold)
  doc.text(invoice.company_flag === 'SHARED' ? 'Intercompany PL ⇄ CN' : 'Chińska spółka', right, 18, { align: 'right' })

  doc.setTextColor(20, 20, 20)
  let y = 36

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text('Invoice No:', left, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(invoice.number || ''), left + 26, y)
  doc.setFont('helvetica', 'bold')
  doc.text('Date:', 120, y)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoice_date || '', 138, y)
  y += 6
  if (invoice.contract_no) {
    doc.setFont('helvetica', 'bold')
    doc.text('Contract No:', left, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(invoice.contract_no), left + 26, y)
    y += 6
  }
  y += 3

  const colW = 90
  doc.setFillColor(245, 246, 248)
  doc.rect(left, y - 4, colW - 4, 30, 'F')
  doc.rect(left + colW, y - 4, colW - 4, 30, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('SELLER', left + 2, y)
  doc.text('BUYER & DELIVER TO', left + colW + 2, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const sellerLines = [
    cnCompany?.display_name || 'Chińska spółka (do uzupełnienia)',
    cnCompany?.usci_no ? `USCI NO: ${cnCompany.usci_no}` : '',
    cnCompany?.address || '',
    cnCompany?.contact_person ? `Contact: ${cnCompany.contact_person}` : '',
    cnCompany?.phone ? `Tel: ${cnCompany.phone}` : '',
  ].filter(Boolean)
  const buyerLines = [
    client?.full_name || client?.name || '',
    client?.nip ? `NIP: ${client.nip}` : '',
    client?.address || '',
  ].filter(Boolean)
  const maxLines = Math.max(sellerLines.length, buyerLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) doc.text(doc.splitTextToSize(sellerLines[i], colW - 8), left + 2, y)
    if (buyerLines[i]) doc.text(doc.splitTextToSize(buyerLines[i], colW - 8), left + colW + 2, y)
    y += 4.2
  }
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const terms = [
    ['TERM OF TRADE:', invoice.term_of_trade || '—'],
    ['TRANSPORT:', invoice.transport_mode || '—'],
    ['COUNTRY OF ORIGIN:', invoice.country_of_origin || 'China'],
    ['TO:', invoice.destination_country || 'Poland'],
  ]
  let tx = left
  for (const [k, v] of terms) {
    doc.setFont('helvetica', 'bold')
    doc.text(k, tx, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v), tx, y + 4)
    tx += 46
  }
  y += 12

  const rows = items.map((it, i) => {
    const total = (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0)
    return [i + 1, it.name_cn || '', it.name_en || it.description || '', it.quantity, it.unit, Number(it.unit_price_net).toFixed(4), total.toFixed(2)]
  })

  autoTable(doc, {
    startY: y,
    head: [['Item', '产品中文品名', 'Description', 'Qty', 'Unit', 'Unit price\n(CNY)', 'Total value\n(CNY)']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: navy, textColor: 255 },
    columnStyles: { 0: { cellWidth: 12 }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 16 }, 5: { cellWidth: 24, halign: 'right' }, 6: { cellWidth: 26, halign: 'right' } },
  })

  y = doc.lastAutoTable.finalY + 4
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  const totalValue = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0), 0)
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.4)
  doc.line(left, y, right, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text('Total:', left, y)
  doc.text(`${totalQty} PCS`, 100, y)
  doc.setTextColor(...gold)
  doc.text(`CNY ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, right, y, { align: 'right' })
  doc.setTextColor(20, 20, 20)

  if (cnCompany?.bank_account) {
    y += 10
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`Bank account: ${cnCompany.bank_account}`, left, y)
  }

  y += 16
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(
    isProforma
      ? 'This proforma invoice is issued electronically by MyChinaPal ERP for quotation purposes only and is not a demand for payment.'
      : 'This commercial invoice is issued electronically by MyChinaPal ERP and is valid without signature.',
    left, 285
  )

  return doc.output('blob')
}
