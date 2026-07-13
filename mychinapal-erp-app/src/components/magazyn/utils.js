const PALETTE = [
  'linear-gradient(135deg,#2563EB,#3B82F6)', 'linear-gradient(135deg,#7C3AED,#A78BFA)',
  'linear-gradient(135deg,#16A34A,#4ADE80)', 'linear-gradient(135deg,#EA580C,#FB923C)',
  'linear-gradient(135deg,#0891B2,#67E8F9)', 'linear-gradient(135deg,#DC2626,#F87171)',
  'linear-gradient(135deg,#9333EA,#F0ABFC)', 'linear-gradient(135deg,#334155,#64748B)',
]

export function photoGradient(code) {
  const s = code || ''
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function monthRange(dateStr) {
  const d = new Date(dateStr)
  const y = d.getFullYear(), m = d.getMonth()
  const start = new Date(y, m, 1).toISOString().slice(0, 10)
  const end = new Date(y, m + 1, 1).toISOString().slice(0, 10)
  return { start, end, mm: String(m + 1).padStart(2, '0'), yyyy: String(y) }
}

export async function nextDocNumber(supabase, docType, dateStr) {
  const { start, end, mm, yyyy } = monthRange(dateStr)
  const { count } = await supabase.from('warehouse_documents').select('id', { count: 'exact', head: true })
    .eq('doc_type', docType).gte('doc_date', start).lt('doc_date', end)
  const n = String((count || 0) + 1).padStart(3, '0')
  return `${docType}/${n}/${mm}/${yyyy}`
}
