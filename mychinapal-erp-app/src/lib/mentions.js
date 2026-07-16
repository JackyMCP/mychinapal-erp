// Wzmianki @Ktoś na czacie — celowo NIE wprowadzamy żadnego specjalnego
// znacznika w treści wiadomości (chat_messages.content zostaje czystym
// tekstem, tak jak dotąd — bez tego tłumaczenie, PDF-y itp. musiałyby
// wiedzieć o nowym formacie). Zamiast tego po prostu skanujemy tekst pod
// kątem "@Imię Nazwisko" znanych profili firmowych.

function sortedByNameLength(profiles) {
  return (profiles || [])
    .filter(p => p?.full_name)
    .slice()
    .sort((a, b) => b.full_name.length - a.full_name.length)
}

// Zwraca tablicę unikalnych user_id wspomnianych w tekście (dopasowanie
// "@Imię Nazwisko", bez rozróżniania wielkości liter) — do zapisania w
// chat_messages.mentioned_user_ids przy wysyłce.
export function extractMentions(text, profiles) {
  if (!text) return []
  const lower = text.toLowerCase()
  const ids = new Set()
  for (const p of sortedByNameLength(profiles)) {
    if (lower.includes('@' + p.full_name.toLowerCase())) ids.add(p.id)
  }
  return Array.from(ids)
}

// Rozbija treść wiadomości na fragmenty tekstowe i "wzmianki", gotowe do
// wyrenderowania w JSX (patrz MentionText.jsx). Dopasowuje najdłuższe imiona
// i nazwiska najpierw, żeby "Jan" nie "zjadał" części "Jan Kowalski".
export function splitMentions(text, profiles) {
  if (!text) return [{ type: 'text', value: '' }]
  const names = sortedByNameLength(profiles).map(p => p.full_name)
  if (names.length === 0) return [{ type: 'text', value: text }]
  const pattern = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`@(${pattern})`, 'gi')
  const parts = []
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'mention', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length ? parts : [{ type: 'text', value: text }]
}
