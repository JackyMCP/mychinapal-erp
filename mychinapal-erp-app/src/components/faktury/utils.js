export function monthRange(dateStr) {
  const d = new Date(dateStr)
  const y = d.getFullYear(), m = d.getMonth()
  const start = new Date(y, m, 1).toISOString().slice(0, 10)
  const end = new Date(y, m + 1, 1).toISOString().slice(0, 10)
  return { start, end, mm: String(m + 1).padStart(2, '0'), yyyy: String(y) }
}

export async function nextInvoiceNumber(supabase, typ, dateStr, companyFlag = 'PL') {
  const { start, end, mm, yyyy } = monthRange(dateStr)
  const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true })
    .gte('invoice_date', start).lt('invoice_date', end).eq('company_flag', companyFlag)
  const n = String((count || 0) + 1).padStart(3, '0')
  // Faktury CN/SHARED — "Commercial Invoice" (CI...) albo "Proforma Invoice" (PI...),
  // tak jak w realnych dokumentach eksportowych chińskiej spółki. Polskie faktury VAT
  // zachowują dotychczasowe prefiksy.
  if (companyFlag !== 'PL') return `${typ === 'pro forma' ? 'PI' : 'CI'}${mm}${String(yyyy).slice(2)}${n}`
  const prefix = typ === 'zaliczkowa' ? 'FZ' : typ === 'pro forma' ? 'PF' : typ === 'korygująca' ? 'FK' : 'FV'
  return `${prefix}/${n}/${mm}/${yyyy}`
}

export function vatRateToNumber(vatRate) {
  if (vatRate === 'zw.') return 0
  const n = parseFloat(vatRate)
  return isNaN(n) ? 0 : n / 100
}

// przelicza pozycje (ilość × cena netto) na netto/vat/brutto oraz sumy pogrupowane po stawce
export function computeTotals(items) {
  let net = 0, vat = 0
  const byRate = {}
  for (const it of items) {
    const itemNet = (Number(it.quantity) || 0) * (Number(it.unit_price_net) || 0)
    const rate = vatRateToNumber(it.vat_rate)
    const itemVat = itemNet * rate
    net += itemNet
    vat += itemVat
    byRate[it.vat_rate] = byRate[it.vat_rate] || { net: 0, vat: 0 }
    byRate[it.vat_rate].net += itemNet
    byRate[it.vat_rate].vat += itemVat
  }
  return { net, vat, gross: net + vat, byRate }
}

export function paymentStatus(invoice) {
  if (invoice.paid_at) return 'opłacona'
  if (invoice.due_date && new Date(invoice.due_date) < new Date(new Date().toDateString())) return 'po terminie'
  return 'nieopłacona'
}

export function daysOverdue(invoice) {
  if (!invoice.due_date) return 0
  const days = Math.floor((new Date(new Date().toDateString()) - new Date(invoice.due_date)) / 86400000)
  return Math.max(0, days)
}
