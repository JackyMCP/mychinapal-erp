import { C } from '../../lib/theme'

const MAP = {
  'ROZLICZONO CAŁKOWICIE': [C.glight, C.green],
  'NIE ROZLICZONO': ['#FFF7ED', C.orange],
  'NIE PODLEGA': [C.bg, C.muted],
  'PRZYCHÓD': [C.glight, C.green],
  'ZAKUP TOWARU CHINY': [C.blight, C.blue],
  'TRANSPORT': ['#FEF3E8', '#C2410C'],
  'ODPRAWA CELNA': ['#FFF0F5', '#DB2777'],
  'PODATKI': [C.plight, C.purple],
  'ZUS': [C.plight, C.purple],
  'KSIĘGOWOŚĆ': [C.plight, C.purple],
  '⚠️ WYMAGA WERYFIKACJI': ['#FFFBEB', C.orange],
  'przychod': [C.glight, C.green],
  'koszt': [C.rlight, C.red],
  'vat_odprawa': [C.plight, C.purple],
  'podatek': [C.plight, C.purple],
  'nie_podlega': [C.bg, C.muted],
  '✅ Rozliczone': [C.glight, C.green],
  '✅ Rozliczono': [C.glight, C.green],
  '⏳ Otwarte': ['#FFF7ED', C.orange],
  'WN+': [C.glight, C.green],
  'MA-': [C.rlight, C.red],
  'KW-': ['#F8F8F8', C.muted],
  'KP+': [C.glight, C.green],
  'WYNAGRODZENIA': ['#F0F9FF', '#0369A1'],
  'MARKETING': ['#FDF4FF', '#9333EA'],
  'BIURO': [C.bg, C.muted],
  'OPŁATY BANKOWE': [C.bg, C.muted],
  'PODRÓŻE': [C.bg, C.muted],
  'REPREZENTACJA': ['#FFF7ED', C.orange],
  'POZOSTAŁE': [C.bg, C.muted],
  'KAPITAŁ': [C.bg, C.muted],
  'PALIWO': ['#FEF3E8', '#C2410C'],
}

export default function Pill({ type, small = false }) {
  const sz = small ? { fontSize: 9, padding: '1px 5px' } : { fontSize: 10, padding: '2px 7px' }
  const t2 = (type || '').toUpperCase()
  const cfg = MAP[type] || MAP[t2] || [C.bg, C.muted]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, ...sz, borderRadius: 20, fontWeight: 700, backgroundColor: cfg[0], color: cfg[1], whiteSpace: 'nowrap' }}>
      ●&nbsp;{type || '—'}
    </span>
  )
}
