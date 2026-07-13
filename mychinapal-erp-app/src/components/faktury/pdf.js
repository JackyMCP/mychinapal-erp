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
