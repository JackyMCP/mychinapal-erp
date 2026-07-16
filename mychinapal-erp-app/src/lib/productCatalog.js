import { supabase } from './supabaseClient'

// Zdjęcia pozycji wyceny leżą w prywatnym buckecie 'dokumenty' (ten sam co
// dokumenty klienta), a Kartoteka towarów w Magazynie (TabKartoteka.jsx)
// oczekuje ścieżek w PUBLICZNYM buckecie 'produkty' (używa getPublicUrl, nie
// podpisanych URL-i) — bez skopiowania zdjęcia do właściwego bucketu karta
// towaru utworzona z wyceny miałaby wybite/puste zdjęcie w Kartotece.
async function copyQuotePhotoToProductsBucket(quotePhotoPath) {
  if (!quotePhotoPath) return null
  try {
    const { data: blob, error } = await supabase.storage.from('dokumenty').download(quotePhotoPath)
    if (error || !blob) return null
    const ext = (quotePhotoPath.split('.').pop() || 'jpg').slice(0, 5)
    const newPath = `z-wyceny/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('produkty').upload(newPath, blob, { contentType: blob.type || 'image/jpeg' })
    if (upErr) return null
    return newPath
  } catch {
    return null
  }
}

// Czy towar o takiej nazwie (bez rozróżniania wielkości liter) już istnieje
// w kartotece danej spółki — żeby nie dublować kart przy każdej synchronizacji.
export async function findExistingProductByName(name, company = 'PL') {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const { data } = await supabase.from('products').select('id,name').eq('company', company).ilike('name', trimmed)
  return (data && data[0]) || null
}

// Tworzy kartę towaru w Magazynie na podstawie POJEDYNCZEJ pozycji wyceny —
// używane zar��wno przy przycisku "+ Dodaj do Magazynu" w zakładce Baza
// produktów, jak i (pośrednio, przez zbiorczą wersję niżej) przy
// automatycznej synchronizacji po wysłaniu wyceny do klienta.
export async function createProductFromQuoteItem(item, { quoteNumber, company = 'PL', userId } = {}) {
  const name = (item.name || '').trim()
  if (!name) return { error: new Error('Pozycja nie ma nazwy.') }
  const existing = await findExistingProductByName(name, company)
  if (existing) return { data: existing, alreadyExisted: true }

  const photo_path = await copyQuotePhotoToProductsBucket(item.photo_paths?.[0] || item.photo_path)
  const code = `WYC-${String(quoteNumber || 'X').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20)}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await supabase.from('products').insert({
    code, name, unit: item.unit || 'szt.', is_service: false,
    photo_path, source: 'wycena', created_by: userId || null, company,
  }).select().single()
  return { data, error }
}

// Wersja zbiorcza — dogrywa karty dla WIELU pozycji naraz (np. wszystkich
// pozycji jednej wyceny przy jej wysłaniu), pomijając nazwy które już
// istnieją w kartotece albo powtarzają się w tej samej partii.
export async function createProductsFromQuoteItems(items, { quoteNumber, company = 'PL', userId } = {}) {
  const names = [...new Set((items || []).map(it => (it.name || '').trim()).filter(Boolean))]
  if (!names.length) return { inserted: 0 }
  const { data: existing } = await supabase.from('products').select('name').eq('company', company).in('name', names)
  const existingLower = new Set((existing || []).map(p => (p.name || '').trim().toLowerCase()))
  const seen = new Set()
  const candidates = []
  for (const it of items) {
    const name = (it.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (existingLower.has(key) || seen.has(key)) continue
    seen.add(key)
    candidates.push(it)
  }
  if (!candidates.length) return { inserted: 0 }
  const rows = await Promise.all(candidates.map(async (it, idx) => ({
    code: `WYC-${String(quoteNumber || 'X').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20)}-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    name: it.name.trim(),
    unit: it.unit || 'szt.',
    is_service: false,
    photo_path: await copyQuotePhotoToProductsBucket(it.photo_paths?.[0] || it.photo_path),
    source: 'wycena',
    created_by: userId || null,
    company,
  })))
  const { error } = await supabase.from('products').insert(rows)
  return { inserted: error ? 0 : rows.length, error }
}
