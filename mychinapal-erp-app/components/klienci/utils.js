const PALETTE = ['#2563EB', '#7C3AED', '#EA580C', '#16A34A', '#DC2626', '#0891B2', '#DB2777', '#64748B']

export function avatarColor(name) {
  const s = name || ''
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function healthColor(days) {
  if (days === null || days === undefined) return '#DC2626'
  if (days <= 14) return '#16A34A'
  if (days <= 45) return '#EA580C'
  return '#DC2626'
}

export const TYP_LABELS = {
  klient_biznesowy: 'Klient biznesowy',
  osoba_fizyczna: 'Osoba fizyczna',
  dostawca_chinski: 'Dostawca (Chiny)',
  agent_posrednik: 'Agent / pośrednik',
  uslugodawca: 'Usługodawca',
}
