// 9 checkpointów procesu zamówienia (zgodnie z realnym procesem MyChinaPal).
// Każdy etap wymaga wgrania dokumentu(ów) z podanej kategorii, żeby system
// sam odblokował kolejny etap — bez ręcznego "przełączania" statusu.
export const DOC_CATEGORIES = [
  'Wycena',
  'Faktura pro-forma',
  'Faktura zaliczkowa',
  'CI Zonglu',
  'CI Fabryka',
  'Kontrola jakości',
  'Odprawa celna Chiny',
  'Dokument transportowy',
  'SAD',
  'Faktura transportowa',
  'Faktura końcowa',
  'Inne',
]

// Od tej wersji wycena NIE jest już tworzona ręcznie w formularzu przez
// zespół CN — CN dostarcza gotowy plik Excel (przez panel zamówienia, czat
// zamówienia z przypisaniem kategorii, albo wprost w zakładce Wyceny), a
// aplikacja parsuje go automatycznie. To rozbija dawny "etap 1" na dwa
// osobne, realne kroki: (1) otrzymanie wyceny od CN, (2) uzupełnienie
// kosztów/marży przez PL i wysyłka gotowej wyceny (Excel) do klienta —
// stąd 10 etapów zamiast 9.
export const STAGE_DEFS = [
  { key: 1, name: 'Wycena od zespołu CN', desc: 'Zespół CN dostarczył wycenę (plik Excel) z pozycjami towaru', categories: [] },
  { key: 2, name: 'Wysłanie wyceny do klienta', desc: 'Zespół PL uzupełnił koszty/marżę i wysłał gotową wycenę (Excel) do klienta', categories: ['Wycena'] },
  { key: 3, name: 'Wpłata klienta na towar', desc: 'Faktura pro-forma i faktura zaliczkowa', categories: ['Faktura pro-forma', 'Faktura zaliczkowa'] },
  { key: 4, name: 'Pieniądze wysłane do Zonglu', desc: 'CI (Commercial Invoice) od Zonglu', categories: ['CI Zonglu'] },
  { key: 5, name: 'Złożenie zamówienia w fabryce', desc: 'CI od fabryki', categories: ['CI Fabryka'] },
  { key: 6, name: 'Produkcja towaru', desc: 'Kontrola jakości przed wysyłką', categories: ['Kontrola jakości'] },
  { key: 7, name: 'Koordynacja logistyki i odprawy celnej w Chinach', desc: 'Dokumenty do odprawy w Chinach i związane koszty', categories: ['Odprawa celna Chiny'] },
  { key: 8, name: 'Transport do Polski', desc: 'Rail Waybill / CMR / konosament', categories: ['Dokument transportowy'] },
  { key: 9, name: 'Odprawa celna w Polsce', desc: 'SAD i faktura za transport', categories: ['SAD', 'Faktura transportowa'] },
  { key: 10, name: 'Transport do klienta i zakończenie', desc: 'Faktura końcowa i opinia klienta', categories: ['Faktura końcowa'] },
]

// Zwraca: { doneStages: Set(1..N), currentIndex: 1..N|null (null = wszystko zrobione), progressPct }
// Drugi argument (opcjonalny) — wyceny (quotes) tego projektu.
// Etap 1 ("Wycena od zespołu CN") jest zrobiony, gdy dla projektu W OGÓLE
// istnieje jakakolwiek wycena — bo od tej wersji wycena powstaje WYŁĄCZNIE
// przez wgranie/rozpoznanie Excela od CN, więc samo jej istnienie = CN
// dostarczył wycenę.
// Etap 2 ("Wysłanie wyceny do klienta") jest zrobiony, gdy którakolwiek
// wycena ma status 'wyslana' (albo — dla starszych/innych ścieżek — gdy
// istnieje wgrany dokument kategorii "Wycena").
export function computeStageProgress(documents, quotes = []) {
  const presentCategories = new Set((documents || []).map(d => d.category))
  const hasAnyQuote = (quotes || []).length > 0
  const quoteSentToClient = (quotes || []).some(q => q.status === 'wyslana')
  let currentIndex = null
  const doneStages = new Set()
  for (const stage of STAGE_DEFS) {
    const docSatisfied = stage.categories.every(c => presentCategories.has(c))
    let satisfied
    if (stage.key === 1) satisfied = hasAnyQuote
    else if (stage.key === 2) satisfied = quoteSentToClient || docSatisfied
    else satisfied = docSatisfied
    if (satisfied) {
      doneStages.add(stage.key)
    } else if (currentIndex === null) {
      currentIndex = stage.key
    }
  }
  const progressPct = Math.round((doneStages.size / STAGE_DEFS.length) * 100)
  return { doneStages, currentIndex, progressPct }
}
