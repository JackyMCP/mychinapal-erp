import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function TabNotatki({ client }) {
  const [text, setText] = useState(client.notes || '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => { setText(client.notes || ''); setSavedAt(null) }, [client.id])

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('clients').update({ notes: text, updated_at: new Date().toISOString() }).eq('id', client.id)
    setSaving(false)
    if (error) { alert('Nie udało się zapisać notatki: ' + error.message); return }
    setSavedAt(new Date())
  }

  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Dodaj notatkę o tym kliencie…"
        style={{ width: '100%', minHeight: 160, border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? .6 : 1 }}>
          {saving ? 'Zapisywanie…' : 'Zapisz notatkę'}
        </button>
        {savedAt && <span style={{ fontSize: 10.5, color: C.green }}>Zapisano {savedAt.toLocaleTimeString('pl-PL')}</span>}
      </div>
    </div>
  )
}
