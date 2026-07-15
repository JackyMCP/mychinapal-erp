// Silnik liczący wycenę: towar (cena EXW z fabryki) + transport (wpisywany przez
// zespół PL) => wartość celna; jeśli zaznaczone "wliczaj cło" — dolicza cło wg
// stawki danej pozycji; na końcu doliczana jest marża zespołu PL na całości
// (towar+transport+cło). Transport jest jeden dla całej wyceny, więc rozkładamy
// go na pozycje proporcjonalnie do wartości towaru — tak liczy się to też przy
// realnym rozliczeniu celnym (wartość celna = wartość transakcyjna + fracht).
export function computeQuoteTotals(items, { transportCost = 0, includeDuty = true, marginPercent = 0 } = {}) {
  const list = items || []
  const goodsTotal = list.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price_cny) || 0), 0)

  const rows = list.map(it => {
    const goodsValue = (Number(it.qty) || 0) * (Number(it.unit_price_cny) || 0)
    const transportShare = goodsTotal > 0
      ? (Number(transportCost) || 0) * (goodsValue / goodsTotal)
      : (Number(transportCost) || 0) / (list.length || 1)
    const customsValue = goodsValue + transportShare
    const dutyAmount = includeDuty ? customsValue * ((Number(it.duty_rate_percent) || 0) / 100) : 0
    const landedCost = customsValue + dutyAmount
    const finalPrice = landedCost * (1 + (Number(marginPercent) || 0) / 100)
    return { ...it, goodsValue, transportShare, customsValue, dutyAmount, landedCost, finalPrice }
  })

  const totals = rows.reduce((acc, r) => ({
    goodsValue: acc.goodsValue + r.goodsValue,
    transportShare: acc.transportShare + r.transportShare,
    customsValue: acc.customsValue + r.customsValue,
    dutyAmount: acc.dutyAmount + r.dutyAmount,
    landedCost: acc.landedCost + r.landedCost,
    finalPrice: acc.finalPrice + r.finalPrice,
  }), { goodsValue: 0, transportShare: 0, customsValue: 0, dutyAmount: 0, landedCost: 0, finalPrice: 0 })

  return { rows, totals }
}

// Przelicznik CNY -> PLN: bazuje na kursie średnim NBP (oficjalne, stabilne
// API — BNP Paribas nie ma publicznego API, tylko stronę WWW), plus prowizja
// banku (%) doliczana na to, że bank sprzedaje walutę drożej niż kurs średni.
export function computePlnConversion(cnyAmount, { nbpRate, commissionPercent = 0 } = {}) {
  const rate = Number(nbpRate) || 0
  const effectiveRate = rate * (1 + (Number(commissionPercent) || 0) / 100)
  return { effectiveRate, plnAmount: (Number(cnyAmount) || 0) * effectiveRate }
}

export function nextQuoteNumber(existingNumbers = []) {
  const year = new Date().getFullYear()
  const prefix = `WYC-${year}-`
  const nums = existingNumbers
    .filter(n => (n || '').startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10))
    .filter(n => !Number.isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

export const STATUS_LABELS = {
  szkic_cn: 'Szkic (zespół CN)',
  do_marzy_pl: 'Do marży (zespół PL)',
  wyslana: 'Wysłana do klienta',
}
