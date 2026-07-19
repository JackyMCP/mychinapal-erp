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

// Generuje kolejny numer karty wyceny (WYC-<rok>-NNNN) — czysto informacyjny
// identyfikator kafelka w module Wyceny, niezwiązany już z żadnym
// przeliczaniem marży (patrz Wyceny.jsx, lib/quoteIntake.js).
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
