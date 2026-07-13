// Stałe współdzielone przez zakładki modułu Kasa & Bank — identyczne jak w zatwierdzonym
// mockupie HTML (żeby wygląd i słownik pojęć się nie rozjeżdżały między wersjami).
export const QUARTERS = ['Q1_2025', 'Q2_2025', 'Q3_2025', 'Q4_2025', 'Q1_2026', 'Q2_2026', 'Q3_2026']
export const Q_LABELS = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']

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
