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

export const STAGE_DEFS = [
  { key: 1, name: 'Wycena i ustalenie szczegółów zamówienia', desc: 'Wycena towaru w pliku Excel', categories: ['Wycena'] },
  { key: 2, name: 'Wpłata klienta na towar', desc: 'Faktura pro-forma i faktura zaliczkowa', categories: ['Faktura pro-forma', 'Faktura zaliczkowa'] },
  { key: 3, name: 'Pieniądze wysłane do Zonglu', desc: 'CI (Commercial Invoice) od Zonglu', categories: ['CI Zonglu'] },
  { key: 4, name: 'Złożenie zamówienia w fabryce', desc: 'CI od fabryki', categories: ['CI Fabryka'] },
  { key: 5, name: 'Produkcja towaru', desc: 'Kontrola jakości przed wysyłką', categories: ['Kontrola jakości'] },
  { key: 6, name: 'Koordynacja logistyki i odprawy celnej w Chinach', desc: 'Dokumenty do odprawy w Chinach i związane koszty', categories: ['Odprawa celna Chiny'] },
  { key: 7, name: 'Transport do Polski', desc: 'Rail Waybill / CMR / konosament', categories: ['Dokument transportowy'] },
  { key: 8, name: 'Odprawa celna w Polsce', desc: 'SAD i faktura za transport', categories: ['SAD', 'Faktura transportowa'] },
  { key: 9, name: 'Transport do klienta i zakończenie', desc: 'Faktura końcowa i opinia klienta', categories: ['Faktura końcowa'] },
]

// Zwraca: { doneStages: Set(1..9), currentIndex: 1..9|null (null = wszystko zrobione), progressPct }
export function computeStageProgress(documents) {
  const presentCategories = new Set((documents || []).map(d => d.category))
  let currentIndex = null
  const doneStages = new Set()
  for (const stage of STAGE_DEFS) {
    const satisfied = stage.categories.every(c => presentCategories.has(c))
    if (satisfied) {
      doneStages.add(stage.key)
    } else if (currentIndex === null) {
      currentIndex = stage.key
    }
  }
  const progressPct = Math.round((doneStages.size / STAGE_DEFS.length) * 100)
  return { doneStages, currentIndex, progressPct }
}
