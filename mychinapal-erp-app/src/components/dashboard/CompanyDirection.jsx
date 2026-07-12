import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function CompanyDirection({ currentUserId }) {
  const [row, setRow] = useState(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('company_direction').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      setRow(data)
      setText(data?.content || '')
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    if (row) {
      const { error } = await supabase.from('company_direction').update({ content: text, updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', row.id)
      if (error) { setSaving(false); alert('Nie udało się zapisać: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('company_direction').insert({ content: text, updated_by: currentUserId }).select().single()
      if (error) { setSaving(false); alert('Nie udało się zapisać: ' + error.message); return }
      setRow(data)
    }
    setSaving(false)
    setEditing(false)
  }

  if (loading) return null

  return (
    <div style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, borderRadius: 14, padding: '16px 20px', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.4px' }}>🧭 Aktualny kierunek firmy <span style={{ color: 'rgba(255,255,255,.35)' }}>· widoczne tylko dla Zarządu</span></div>
        {!editing && <span onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', cursor: 'pointer' }}>Edytuj</span>}
      </div>
      {editing ? (
        <>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Opisz aktualne priorytety i kierunek firmy…"
            style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: 10, fontSize: 13, color: '#fff', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
            <button onClick={() => { setEditing(false); setText(row?.content || '') }} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Anuluj</button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{row?.content || <span style={{ color: 'rgba(255,255,255,.4)' }}>Brak wpisu — kliknij "Edytuj" żeby dodać kierunek firmy na ten kwartał.</span>}</div>
      )}
    </div>
  )
}
