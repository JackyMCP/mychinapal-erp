import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function NewChannelModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [linkType, setLinkType] = useState('brak') // brak | klient | projekt
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clients').select('id,name').order('name'),
        supabase.from('projects').select('id,client_id,order_label').order('order_label'),
      ])
      setClients(c || [])
      setProjects(p || [])
    })()
  }, [])

  const clientProjects = projects.filter(p => p.client_id === clientId)

  const handleCreate = async () => {
    if (!name.trim()) { setError('Podaj nazwę kanału'); return }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      name: name.trim(),
      created_by: user.id,
      client_id: linkType === 'klient' && clientId ? clientId : (linkType === 'projekt' && projectId ? (projects.find(p => p.id === projectId)?.client_id || null) : null),
      project_id: linkType === 'projekt' && projectId ? projectId : null,
    }
    const { data, error: err } = await supabase.from('chat_channels').insert(payload).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 22, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Nowy kanał</div>

        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nazwa kanału *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="np. Logistyka Q3, Sprawy ogólne..."
          style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14 }} />

        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Powiązanie</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['brak', 'Brak (ogólny)'], ['klient', 'Klient'], ['projekt', 'Projekt/zamówienie']].map(([k, l]) => (
            <div key={k} onClick={() => setLinkType(k)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${linkType === k ? C.blue : C.border}`, background: linkType === k ? C.blue : 'transparent', color: linkType === k ? '#fff' : C.muted }}>{l}</div>
          ))}
        </div>

        {linkType === 'klient' && (
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14 }}>
            <option value="">— wybierz klienta —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {linkType === 'projekt' && (
          <>
            <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId('') }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 8 }}>
              <option value="">— wybierz klienta —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!clientId} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14 }}>
              <option value="">— wybierz zamówienie —</option>
              {clientProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
            </select>
          </>
        )}

        {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>Anuluj</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Tworzę…' : '+ Utwórz kanał'}
          </button>
        </div>
      </div>
    </div>
  )
}
