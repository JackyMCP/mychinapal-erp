// Silnik liczący wycenę: towar (cena EXW z fabryki, zawsze w CNY) + transport
// (wpisywany przez zespół PL, w DOWOLNEJ walucie — PLN/CNY/USD/EUR) => wartość
// celna; jeśli zaznaczone "wliczaj cło" — dolicza cło wg stawki danej pozycji;
// na końcu doliczana jest marża zespołu PL na całości (towar+transport+cło).
// Całe liczenie (poza samą ceną EXW wejściową) odbywa się w PLN — zarówno
// towar jak i transport są od razu przeliczane na złotówki wg podanych kursów
// (NBP + prowizja banku), więc cena dla klienta zawsze wychodzi w PLN.
// Na końcu doliczany jest VAT (domyślnie 23%) — netto to cena bez VAT (tak
// wystawia się polskie wyceny B2B), brutto to netto+VAT.
// Transport jest jeden dla całej wyceny, więc rozkładamy go na pozycje
// proporcjonalnie do wartości towaru — tak liczy się to też przy realnym
// rozliczeniu celnym (wartość celna = wartość transakcyjna + fracht).
export function computeQuoteTotals(items, {
  transportCost = 0, includeDuty = true, marginPercent = 0,
  cnyRate = 1, transportRate = 1, vatPercent = 23,
} = {}) {
  const list = items || []
  const cny = Number(cnyRate) || 0
  const tRate = Number(transportRate) || 0
  const goodsTotalPln = list.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price_cny) || 0) * cny, 0)
  const transportPln = (Number(transportCost) || 0) * tRate

  const rows = list.map(it => {
    const goodsValue = (Number(it.qty) || 0) * (Number(it.unit_price_cny) || 0) * cny // PLN
    const transportShare = goodsTotalPln > 0
      ? transportPln * (goodsValue / goodsTotalPln)
      : transportPln / (list.length || 1)
    const customsValue = goodsValue + transportShare
    const dutyAmount = includeDuty ? customsValue * ((Number(it.duty_rate_percent) || 0) / 100) : 0
    const landedCost = customsValue + dutyAmount
    const finalPrice = landedCost * (1 + (Number(marginPercent) || 0) / 100) // netto PLN
    const vatAmount = finalPrice * ((Number(vatPercent) || 0) / 100)
    const finalPriceGross = finalPrice + vatAmount
    return { ...it, goodsValue, transportShare, customsValue, dutyAmount, landedCost, finalPrice, vatAmount, finalPriceGross }
  })

  const totals = rows.reduce((acc, r) => ({
    goodsValue: acc.goodsValue + r.goodsValue,
    transportShare: acc.transportShare + r.transportShare,
    customsValue: acc.customsValue + r.customsValue,
    dutyAmount: acc.dutyAmount + r.dutyAmount,
    landedCost: acc.landedCost + r.landedCost,
    finalPrice: acc.finalPrice + r.finalPrice,
    vatAmount: acc.vatAmount + r.vatAmount,
    finalPriceGross: acc.finalPriceGross + r.finalPriceGross,
  }), { goodsValue: 0, transportShare: 0, customsValue: 0, dutyAmount: 0, landedCost: 0, finalPrice: 0, vatAmount: 0, finalPriceGross: 0 })

  return { rows, totals }
}

// Przelicznik dowolna waluta (CNY/USD/EUR) -> PLN: bazuje na kursie średnim
// NBP (oficjalne, stabilne API — BNP Paribas nie ma publicznego API, tylko
// stronę WWW), plus prowizja banku (%) doliczana na to, że bank sprzedaje
// walutę drożej niż kurs średni.
export function computePlnConversion(amount, { nbpRate, commissionPercent = 0 } = {}) {
  const rate = Number(nbpRate) || 0
  const effectiveRate = rate * (1 + (Number(commissionPercent) || 0) / 100)
  return { effectiveRate, plnAmount: (Number(amount) || 0) * effectiveRate }
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
