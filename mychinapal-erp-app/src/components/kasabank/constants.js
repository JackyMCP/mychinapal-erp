// Stałe współdzielone przez zakładki modułu Kasa & Bank — identyczne jak w zatwierdzonym
// mockupie HTML (żeby wygląd i słownik pojęć się nie rozjeżdżały między wersjami).
//
// UWAGA: QUARTERS/Q_LABELS poniżej to lista PL-only, celowo NIE ruszona — kontrola
// kasy i stan kont (TabKontrolaKasy, stanKont w KasaBank.jsx) indeksują dane
// pozycyjnie (QUARTERS.indexOf(selQ), stanKont[i].vals[qi]) i zakładają dokładnie
// tę samą, ustaloną wcześniej listę 2025-2026 — zmiana jej długości/kolejności
// przesunęłaby wszystkie te dane. Osobny, szerszy zakres (od 2024, dla obu spółek)
// jest niżej w quartersForCompany() — używany tam, gdzie filtrujemy transakcje
// PO WARTOŚCI (row.q), a nie po pozycji w tablicy, więc jest bezpieczny.
export const QUARTERS = ['Q1_2025', 'Q2_2025', 'Q3_2025', 'Q4_2025', 'Q1_2026', 'Q2_2026', 'Q3_2026']
export const Q_LABELS = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']

// Pierwszy rok działalności każdej spółki.
export const COMPANY_START_YEAR = { PL: 2025, CN: 2024 }

// Pełna, szeroka lista kwartałów (2024 -> bieżący rok + 1), niezależna od QUARTERS
// powyżej — do użytku wyłącznie w miejscach filtrujących transakcje PO WARTOŚCI
// pola row.q (a nie po indeksie w tablicy), np. lista rozwijalna w TabTransakcje.
function buildQuartersFrom(startYear, endYear) {
  const rows = []
  for (let y = startYear; y <= endYear; y++) {
    for (let q = 1; q <= 4; q++) rows.push({ key: `Q${q}_${y}`, label: `Q${q} ${y}`, year: y, q })
  }
  return rows
}

const FULL_RANGE_END_YEAR = new Date().getFullYear() + 1

// Zwraca [{ key: 'Q1_2024', label: 'Q1 2024', year: 2024, q: 1 }, ...] od startu
// działalności danej spółki do bieżącego roku + 1.
export function quartersForCompany(company) {
  const startYear = COMPANY_START_YEAR[company] || COMPANY_START_YEAR.PL
  return buildQuartersFrom(startYear, FULL_RANGE_END_YEAR)
}

export const CATEGORIES = [
  'ZAKUP TOWARU CHINY', 'TRANSPORT', 'ODPRAWA CELNA', 'PRZYCHÓD', 'PODATKI', 'ZUS',
  'BIURO', 'MARKETING', 'NETWORKING', 'REPREZENTACJA', 'PODRÓŻE', 'PALIWO',
  'KSIĘGOWOŚĆ', 'OBSŁUGA PRAWNA', 'WYNAGRODZENIA', 'OPŁATY BANKOWE', 'POZOSTAŁE',
  'KAPITAŁ', '⚠️ WYMAGA WERYFIKACJI',
]

export const FLOW_TYPES = ['przychod', 'koszt', 'vat_odprawa', 'podatek', 'nie_podlega']

// Kategorie, które z założenia NIE mają przypisanego klienta (wydatki wewnętrzne firmy) —
// brak klienta na takich wierszach nie jest błędem wymagającym uzupełnienia.
export const INTERNAL_CATEGORIES = [
  'PODATKI', 'ZUS', 'KSIĘGOWOŚĆ', 'OBSŁUGA PRAWNA', 'WYNAGRODZENIA', 'BIURO',
  'PODRÓŻE', 'PALIWO', 'MARKETING', 'NETWORKING', 'REPREZENTACJA', 'POZOSTAŁE',
  'OPŁATY BANKOWE', 'KAPITAŁ',
]

export const rowBg = (cat, dir, isHelper) => {
  if (isHelper) return '#F8F8F8'
  const c = (cat || '').toUpperCase()
  if (c === 'PRZYCHÓD' || dir === 'WN+') return '#F0FDF4'
  if (c === 'ZAKUP TOWARU CHINY') return '#EFF6FF'
  if (c === 'TRANSPORT') return '#FEF3E8'
  if (c === 'ODPRAWA CELNA') return '#FFF0F5'
  if (['PODATKI', 'ZUS', 'KSIĘGOWOŚĆ', 'CIT'].some(x => c.includes(x))) return '#F5F3FF'
  if (c.includes('WERYFIKACJI') || c.includes('⚠️')) return '#FFFBEB'
  if (INTERNAL_CATEGORIES.includes(c)) return '#F8F8F8'
  return '#FFFFFF'
}

// Wiersze pomocnicze z oryginalnego rejestru Excela (ręczne rozbicia wspólnych przelewów) —
// w bazie nie mają już charakterystycznego prefiksu "S-" w id (to teraz prawdziwy uuid),
// więc rozpoznajemy je po treści: opis zaczyna się od "S-" albo wiersz jest całkowicie pusty.
export const isHelperRow = (t) =>
  (t.description || '').startsWith('S-') ||
  (!t.contractor && !t.description && !t.category && Number(t.amount) === 0 && !t.direction)

// Kategorie dla spółki chińskiej — oparte o chińskie realia podatkowo-księgowe
// (fapiao, VAT 增值税, CIT 企业所得税, ubezpieczenia 社保/公积金). Nazwy po polsku
// dla wygody zespołu, chiński odpowiednik w nawiasie dla jednoznaczności.
// Ten zestaw będzie doprecyzowany razem z zakładką VAT/Księgowość CN, gdy
// ustalimy ostateczny status podatnika (mały / ogólny).
export const CN_CATEGORIES = [
  'SPRZEDAŻ TOWARU', 'ZAKUP SUROWCA/TOWARU', 'TRANSPORT WEWNĘTRZNY CN',
  'VAT NALEŻNY (销项增值税)', 'VAT NALICZONY (进项增值税)', 'CIT (企业所得税)',
  'UBEZPIECZENIA SPOŁECZNE (社保/公积金)', 'WYNAGRODZENIA (工资)',
  'BIURO / NAJEM (办公/租金)', 'KSIĘGOWOŚĆ (代理记账)', 'OPŁATY BANKOWE',
  'MARKETING', 'POZOSTAŁE', 'KAPITAŁ', '⚠️ WYMAGA WERYFIKACJI',
]

export const CN_INTERNAL_CATEGORIES = [
  'VAT NALEŻNY (销项增值税)', 'VAT NALICZONY (进项增值税)', 'CIT (企业所得税)',
  'UBEZPIECZENIA SPOŁECZNE (社保/公积金)', 'WYNAGRODZENIA (工资)', 'BIURO / NAJEM (办公/租金)',
  'KSIĘGOWOŚĆ (代理记账)', 'OPŁATY BANKOWE', 'MARKETING', 'POZOSTAŁE', 'KAPITAŁ',
]
