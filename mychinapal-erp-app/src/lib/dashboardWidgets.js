// Rejestr widgetów Dashboardu — system "dodaj/usuń/przestaw" (patrz
// DashboardWidgetSettings.jsx + Dashboard.jsx). Każdy pracownik ma WŁASNY
// układ (zapisany w tabeli user_dashboard_layout, kluczowany po user_id) —
// to, co widzi jedna osoba, nie wpływa na innych.
//
// `zarzadOnly: true` oznacza widget widoczny wyłącznie dla zarządu —
// pracownik go w ogóle nie zobaczy na liście ustawień, niezależnie od tego,
// co ma zapisane w swoim layoucie (ochrona nie tylko wizualna, dane tych
// widgetów i tak nie są ładowane dla zwykłych pracowników).
export const WIDGET_REGISTRY = [
  { id: 'worldclocks', label: 'Zegary PL / Szanghaj', icon: '🕐', zarzadOnly: false },
  { id: 'companydirection', label: 'Kierunek firmy', icon: '🧭', zarzadOnly: true },
  { id: 'moneygames', label: 'Wpływy / Wypływy', icon: '💰', zarzadOnly: true },
  { id: 'whoami', label: 'Twój profil', icon: '👤', zarzadOnly: false },
  { id: 'myprojects', label: 'Moje projekty', icon: '📦', zarzadOnly: false },
  { id: 'mytasks', label: 'Moje zadania', icon: '✅', zarzadOnly: false },
  { id: 'calendar', label: 'Kalendarz', icon: '📅', zarzadOnly: false },
  { id: 'chatogolny', label: 'Czat Ogólny', icon: '💬', zarzadOnly: false },
  { id: 'chatzarzadu', label: 'Czat Zarządu', icon: '👑', zarzadOnly: true },
]

export function defaultLayout() {
  return WIDGET_REGISTRY.map(w => ({ id: w.id, visible: true }))
}

// Dokłada do zapisanego layoutu wszystkie nowe widgety, które kiedyś
// dodamy do rejestru (żeby istniejący użytkownicy zobaczyli je automatycznie
// na końcu, zamiast nigdy), i usuwa wpisy dla widgetów, które już nie
// istnieją (np. wycofane w przyszłości).
export function normalizeLayout(saved) {
  const known = new Set(WIDGET_REGISTRY.map(w => w.id))
  const cleaned = (Array.isArray(saved) ? saved : []).filter(e => e && known.has(e.id))
  const present = new Set(cleaned.map(e => e.id))
  for (const w of WIDGET_REGISTRY) {
    if (!present.has(w.id)) cleaned.push({ id: w.id, visible: true })
  }
  return cleaned
}

export function widgetsForRole(layout, isZarzad) {
  return normalizeLayout(layout).filter(e => {
    const def = WIDGET_REGISTRY.find(w => w.id === e.id)
    return def && (!def.zarzadOnly || isZarzad)
  })
}
