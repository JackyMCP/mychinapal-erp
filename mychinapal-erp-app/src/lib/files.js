// Bezpieczna nazwa pliku do użycia jako klucz w Supabase Storage.
// Storage odrzuca klucze ze znakami spoza ASCII (np. chińskimi) i niektórymi
// znakami specjalnymi/spacjami ("Invalid key") — oryginalną nazwę pliku
// (z polskimi/chińskimi znakami) trzymamy osobno w bazie (kolumna file_name)
// wyłącznie do wyświetlania, a to tutaj służy TYLKO do budowy ścieżki w Storage.
export function safeFileName(name) {
  if (!name) return 'plik'
  const dot = name.lastIndexOf('.')
  const ext = dot > -1 ? name.slice(dot + 1) : ''
  const base = dot > -1 ? name.slice(0, dot) : name
  const safeBase = base
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80) || 'plik'
  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 10)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}
