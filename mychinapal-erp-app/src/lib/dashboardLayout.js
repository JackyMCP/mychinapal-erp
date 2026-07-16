import { supabase } from './supabaseClient'
import { defaultLayout, normalizeLayout } from './dashboardWidgets'

// Osobisty układ widgetów Dashboardu — jedna zapisana wartość na
// użytkownika (tabela user_dashboard_layout, RLS: tylko właściciel wiersza).
export async function loadDashboardLayout(userId) {
  if (!userId) return defaultLayout()
  try {
    const { data } = await supabase.from('user_dashboard_layout').select('layout').eq('user_id', userId).maybeSingle()
    if (data?.layout) return normalizeLayout(data.layout)
  } catch {
    // brak wiersza / błąd sieci — zostaje domyślny układ
  }
  return defaultLayout()
}

export async function saveDashboardLayout(userId, layout) {
  if (!userId) return { error: new Error('missing_user') }
  return supabase.from('user_dashboard_layout').upsert({
    user_id: userId, layout, updated_at: new Date().toISOString(),
  })
}
