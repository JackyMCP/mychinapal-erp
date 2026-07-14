import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function startOfWeek(d) {
  const day = d.getDay() || 7 // niedziela (0) -> 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day + 1)
  monday.setHours(0, 0, 0, 0)
  return monday
}

// Cotygodniowe przypomnienie o wgraniu wyciągu bankowego — od piątku, jeśli
// w tym tygodniu (pon-teraz) nie wgrano jeszcze żadnego wyciągu dla danej spółki.
export default function useWeeklyStatementReminder(company) {
  const [needsUpload, setNeedsUpload] = useState(false)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    ;(async () => {
      const now = new Date()
      const isFridayOrLater = [5, 6, 0].includes(now.getDay()) // pt, sob, niedz
      if (!isFridayOrLater) { if (!cancelled) setNeedsUpload(false); return }
      const monday = startOfWeek(now)
      const { data } = await supabase.from('bank_statement_uploads').select('id').eq('company', company).gte('uploaded_at', monday.toISOString()).limit(1)
      if (!cancelled) setNeedsUpload(!data || data.length === 0)
    })()
    return () => { cancelled = true }
  }, [company])

  return needsUpload
}
