import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'mcp_lang'
const FLUSH_DELAY_MS = 250
const BATCH_MAX = 40

// tekst, który nie zawiera żadnej litery (same liczby / znaki / emoji) nie
// wymaga tłumaczenia — zwracamy go od razu bez zapytania do AI
const hasLetters = (s) => /\p{L}/u.test(s)

// krótkie kody/skróty, których NIE tłumaczymy nigdy (waluty, akronimy prawne/
// księgowe, nazwy własne) — zostają identyczne w obu językach
const NEVER_TRANSLATE = new Set([
  'PLN', 'USD', 'EUR', 'CNY', 'RMB', 'GBP',
  'VAT', 'NIP', 'KRS', 'REGON', 'SAD', 'RLS', 'JPK', 'JPK V7K', 'MPP',
  'PL', 'ZH', 'CN', 'MC', 'CI', 'API', 'URL', 'ID', 'PDF', 'CSV', 'SQL',
  'MyChinaPal', 'Zonglu',
])

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'pl')
  const [cache, setCache] = useState({}) // { sourceText: zhText }
  const pendingRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const timerRef = useRef(null)
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  const setLang = useCallback((l) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }, [])

  const flush = useCallback(async () => {
    timerRef.current = null
    const batch = Array.from(pendingRef.current).filter(t => !inFlightRef.current.has(t)).slice(0, BATCH_MAX)
    console.log('[i18n] flush() start, batch size:', batch.length, batch)
    if (batch.length === 0) return
    batch.forEach(t => { pendingRef.current.delete(t); inFlightRef.current.add(t) })

    try {
      // 1) sprawdź co już jest w współdzielonym cache w bazie
      const { data: existing, error: selErr } = await supabase.from('ui_translations').select('source_text, zh_text').in('source_text', batch)
      console.log('[i18n] ui_translations select ->', { existing, selErr })
      const found = new Map((existing || []).map(r => [r.source_text, r.zh_text]))
      const missing = batch.filter(t => !found.has(t))

      let fresh = {}
      if (missing.length > 0) {
        // UWAGA: w Supabase funkcja widnieje w liście jako "translate-batch", ale jej faktyczny
        // adres/slug (przydzielony automatycznie przy tworzeniu) to "dynamic-task" — stąd wywołanie
        // musi używać tej drugiej nazwy, inaczej dostajemy 404.
        console.log('[i18n] invoking dynamic-task with', missing.length, 'texts:', missing)
        const { data, error } = await supabase.functions.invoke('dynamic-task', { body: { texts: missing } })
        console.log('[i18n] dynamic-task result ->', { data, error })
        if (!error && data?.translations) fresh = data.translations
      }

      const merged = {}
      found.forEach((v, k) => { merged[k] = v })
      Object.entries(fresh).forEach(([k, v]) => { merged[k] = v })
      console.log('[i18n] merged translations this batch:', merged)

      if (Object.keys(merged).length > 0) {
        setCache(prev => ({ ...prev, ...merged }))
        // zapisz nowo przetłumaczone teksty do wspólnego cache w bazie, żeby
        // kolejni użytkownicy (i kolejne wizyty) mieli je już gotowe od razu
        const toUpsert = Object.entries(fresh).map(([source_text, zh_text]) => ({ source_text, zh_text }))
        if (toUpsert.length > 0) supabase.from('ui_translations').upsert(toUpsert, { onConflict: 'source_text' }).then(({ error: upErr }) => {
          if (upErr) console.error('[i18n] upsert to ui_translations failed:', upErr)
        })
      }
    } catch (e) {
      console.error('[i18n] flush() threw an exception:', e)
    } finally {
      batch.forEach(t => inFlightRef.current.delete(t))
      if (pendingRef.current.size > 0) scheduleFlush()
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setTimeout(flush, FLUSH_DELAY_MS)
  }, [flush])

  const t = useCallback((text) => {
    if (text === null || text === undefined) return text
    const str = String(text)
    if (lang !== 'zh') return str
    if (!hasLetters(str)) return str
    if (NEVER_TRANSLATE.has(str.trim())) return str
    const known = cacheRef.current[str]
    if (known) return known
    if (!pendingRef.current.has(str) && !inFlightRef.current.has(str)) {
      pendingRef.current.add(str)
      scheduleFlush()
    }
    return str
  }, [lang, scheduleFlush])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang() musi być użyty wewnątrz <LanguageProvider>')
  return ctx
}
