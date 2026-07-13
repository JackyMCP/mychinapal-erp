// Wspólna paleta kolorów i pomocnicze funkcje formatujące — te same co w prototypie
export const C = {
  navy: '#0A1628', navy2: '#112240',
  blue: '#2563EB', blue3: '#3B82F6', blight: '#EFF6FF', bmid: '#DBEAFE',
  red: '#DC2626', rlight: '#FEF2F2', rmid: '#FEE2E2',
  green: '#16A34A', glight: '#F0FDF4',
  orange: '#EA580C', olight: '#FFF7ED',
  purple: '#7C3AED', plight: '#F5F3FF',
  text: '#0F172A', text2: '#334155', muted: '#64748B',
  border: '#E2E8F0', bg: '#F4F7FC', white: '#FFFFFF',
}

export const fmt = (n, dec = 2) => {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export const fmtPct = (n) => (Number(n) * 100).toFixed(1) + '%'
