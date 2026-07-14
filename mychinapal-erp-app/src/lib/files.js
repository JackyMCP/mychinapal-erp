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

// Limit rozmiaru pliku wgrywanego z aplikacji (ochrona limitu Storage na
// koncie Supabase — plan Free ma tylko 1GB, Pro 100GB w cenie). 40MB
// pokrywa z dużym zapasem skany, zdjęcia i większość PDF-ów/arkuszy.
export const MAX_FILE_SIZE_MB = 40
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export function isFileTooBig(file) {
  return !!file && file.size > MAX_FILE_SIZE_BYTES
}

// Wykrywanie, czy załącznik jest obrazkiem — używane w czatach, żeby zdjęcia
// wyświetlały się od razu jako podgląd (tak jak w typowych komunikatorach),
// zamiast jako sam link "📎 nazwa_pliku".
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i
export function isImageFile(name) {
  return !!name && IMAGE_EXT_RE.test(name)
}
