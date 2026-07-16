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
// Bezpieczne parsowanie liczb wpisywanych ręcznie przez użytkownika. Pola
// liczbowe w tej aplikacji bywają wpisywane z przecinkiem jako separatorem
// dziesiętnym (polska klawiatura/locale — np. "2,7"), a zwykłe Number("2,7")
// zwraca NaN. To był realny powód, dla którego wpisanie np. marży czasem
// "nic nie zmieniało" — NaN wpadał w `|| 0` i po cichu liczyło się tak, jakby
// pole było puste. toNum() zawsze zwraca poprawną liczbę (albo 0).
export function toNum(v) {
  if (v === '' || v === null || v === undefined) return 0
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function computeQuoteTotals(items, {
  transportCost = 0, includeDuty = true, marginPercent = 0,
  cnyRate = 1, transportRate = 1, vatPercent = 23,
  // Dwa dodatkowe koszty globalne doliczane przez zespół PL — koszt odprawy
  // celnej PO STRONIE CHIŃSKIEJ (eksportowej) i koszt dostawy towaru do
  // klienta PO STRONIE POLSKIEJ (ostatni odcinek). Oba podawane w dowolnej
  // walucie (jak transport) i przeliczane na PLN własnym kursem PRZED
  // wejściem tutaj (patrz *RateEff w QuoteEditor.jsx) — tutaj liczą się już
  // w PLN, dokładnie jak transportCost. Rozkładane na pozycje proporcjonalnie
  // do wartości towaru, tak samo jak transport.
  chinaCustomsClearanceCost = 0, chinaCustomsClearanceRate = 1,
  plDeliveryToClientCost = 0, plDeliveryRate = 1,
} = {}) {
  const list = items || []
  const cny = toNum(cnyRate)
  const tRate = toNum(transportRate)
  const goodsTotalPln = list.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price_cny) * cny, 0)
  const transportPln = toNum(transportCost) * tRate
  const chinaCustomsClearancePln = toNum(chinaCustomsClearanceCost) * toNum(chinaCustomsClearanceRate)
  const plDeliveryPln = toNum(plDeliveryToClientCost) * toNum(plDeliveryRate)
  const extraCostsPln = chinaCustomsClearancePln + plDeliveryPln

  const rows = list.map(it => {
    const goodsValue = toNum(it.qty) * toNum(it.unit_price_cny) * cny // PLN
    const transportShare = goodsTotalPln > 0
      ? transportPln * (goodsValue / goodsTotalPln)
      : transportPln / (list.length || 1)
    const extraCostsShare = goodsTotalPln > 0
      ? extraCostsPln * (goodsValue / goodsTotalPln)
      : extraCostsPln / (list.length || 1)
    const customsValue = goodsValue + transportShare
    const dutyAmount = includeDuty ? customsValue * (toNum(it.duty_rate_percent) / 100) : 0
    const landedCost = customsValue + dutyAmount + extraCostsShare
    // Zespół PL może ręcznie ustawić cenę PLN/szt. dla konkretnej pozycji
    // (pole "Cena PLN/szt." w edytorze) — wtedy TA pozycja ma cenę
    // finalną = ilość × ta ręczna cena, zamiast automatycznego
    // landedCost × (1 + marża%). Pozycje bez ręcznej ceny liczą się jak
    // dotychczas (globalna marża % z panelu "Transport, cło i marża").
    const hasManualPln = it.unit_price_pln !== null && it.unit_price_pln !== undefined && it.unit_price_pln !== ''
    const finalPrice = hasManualPln
      ? toNum(it.qty) * toNum(it.unit_price_pln)
      : landedCost * (1 + toNum(marginPercent) / 100) // netto PLN
    const vatAmount = finalPrice * (toNum(vatPercent) / 100)
    const finalPriceGross = finalPrice + vatAmount
    return { ...it, goodsValue, transportShare, extraCostsShare, customsValue, dutyAmount, landedCost, finalPrice, vatAmount, finalPriceGross }
  })

  // Całkowita objętość zamówienia (suma CBM wszystkich pozycji, które mają
  // wpisaną liczbową objętość — pozycje bez CBM, np. z samą uwagą o
  // kontenerze zamiast liczby, są pomijane w sumie, nie liczone jako 0).
  const totalCbm = rows.reduce((s, r) => s + (r.cbm !== '' && r.cbm !== null && r.cbm !== undefined && !Number.isNaN(Number(r.cbm)) ? Number(r.cbm) : 0), 0)

  const totals = rows.reduce((acc, r) => ({
    goodsValue: acc.goodsValue + r.goodsValue,
    transportShare: acc.transportShare + r.transportShare,
    extraCostsShare: acc.extraCostsShare + r.extraCostsShare,
    customsValue: acc.customsValue + r.customsValue,
    dutyAmount: acc.dutyAmount + r.dutyAmount,
    landedCost: acc.landedCost + r.landedCost,
    finalPrice: acc.finalPrice + r.finalPrice,
    vatAmount: acc.vatAmount + r.vatAmount,
    finalPriceGross: acc.finalPriceGross + r.finalPriceGross,
  }), { goodsValue: 0, transportShare: 0, extraCostsShare: 0, customsValue: 0, dutyAmount: 0, landedCost: 0, finalPrice: 0, vatAmount: 0, finalPriceGross: 0 })
  totals.totalCbm = totalCbm
  totals.chinaCustomsClearancePln = chinaCustomsClearancePln
  totals.plDeliveryPln = plDeliveryPln

  return { rows, totals }
}

// Przelicznik dowolna waluta (CNY/USD/EUR) -> PLN: bazuje na kursie średnim
// NBP (oficjalne, stabilne API — BNP Paribas nie ma publicznego API, tylko
// stronę WWW), plus prowizja banku (%) doliczana na to, że bank sprzedaje
// walutę drożej niż kurs średni.
export function computePlnConversion(amount, { nbpRate, commissionPercent = 0 } = {}) {
  const rate = toNum(nbpRate)
  const effectiveRate = rate * (1 + toNum(commissionPercent) / 100)
  return { effectiveRate, plnAmount: toNum(amount) * effectiveRate }
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
