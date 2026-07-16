import { supabase } from './supabaseClient'

// Globalne (firmowe) ustawienie typografii — czcionka podstawowa i odstępy,
// zapisywane w company_settings pod jednym kluczem jako JSON. Dotyczy
// TYLKO tekstu podstawowego (paragrafy, etykiety, przyciski) — nagłówki
// brandowane czcionką 'Syne' (logo, tytuły sekcji) zostają bez zmian, żeby
// nie rozjechać identyfikacji wizualnej firmy.
export const SETTINGS_KEY = 'app_typography'

export const FONT_OPTIONS = [
  { value: "'Inter', system-ui, sans-serif", label: 'Inter (domyślna)' },
  { value: "system-ui, -apple-system, sans-serif", label: 'Systemowa (jak na komputerze użytkownika)' },
  { value: "'Georgia', 'Times New Roman', serif", label: 'Georgia (szeryfowa, bardziej formalna)' },
  { value: "'Trebuchet MS', 'Segoe UI', sans-serif", label: 'Trebuchet MS' },
  { value: "'Verdana', 'Arial', sans-serif", label: 'Verdana (większa czytelność)' },
]

export const DEFAULT_TYPOGRAPHY = {
  fontFamily: FONT_OPTIONS[0].value,
  letterSpacing: 0,   // px, dodatkowy odstęp między literami
  lineHeightScale: 1, // mnożnik domyślnej wysokości linii
}

export function applyTypography(settings) {
  const s = { ...DEFAULT_TYPOGRAPHY, ...(settings || {}) }
  const root = document.documentElement
  root.style.setProperty('--app-font-family', s.fontFamily)
  root.style.setProperty('--app-letter-spacing', `${s.letterSpacing}px`)
  root.style.setProperty('--app-line-height-scale', String(s.lineHeightScale))
}

export async function loadTypography() {
  try {
    const { data } = await supabase.from('company_settings').select('value').eq('key', SETTINGS_KEY).single()
    if (data?.value) return { ...DEFAULT_TYPOGRAPHY, ...JSON.parse(data.value) }
  } catch {
    // brak wiersza / niepoprawny JSON — zostają wartości domyślne
  }
  return DEFAULT_TYPOGRAPHY
}

export async function saveTypography(settings) {
  return supabase.from('company_settings').upsert({ key: SETTINGS_KEY, value: JSON.stringify(settings) })
}
