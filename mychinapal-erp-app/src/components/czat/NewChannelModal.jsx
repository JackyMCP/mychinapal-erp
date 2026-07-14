import { useLang } from "../../lib/i18n/LanguageContext";
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function NewChannelModal({ onClose, onCreated }) {
  const {
    t
  } = useLang();

  const [name, setName] = useState('')
  const [linkType, setLinkType] = useState('brak') // brak | klient
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from('clients').select('id,name').order('name')
      setClients(c || [])
    })()
  }, [])

  // Kanały zamówień (projekt) NIE są tworzone tutaj — powstają automatycznie
  // z panelu Projekty/Zamówienia (jeden na zamówienie) i są dostępne tylko
  // przez odnośnik z tego panelu albo z czatu klienta, do którego należą.

  const handleCreate = async () => {
    if (!name.trim()) { setError('Podaj nazwę kanału'); return }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      name: name.trim(),
      created_by: user.id,
      client_id: linkType === 'klient' && clientId ? clientId : null,
      project_id: null,
    }
    const { data, error: err } = await supabase.from('chat_channels').insert(payload).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 22, width: 440, maxWidth: '92vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("Nowy kanał")}</div>

        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Nazwa kanału *")}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t("np. Logistyka Q3, Sprawy ogólne...")}
          style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14 }} />

        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Powiązanie")}</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['brak', 'Brak (ogólny)'], ['klient', 'Klient']].map(([k, l]) => (
            <div key={k} onClick={() => setLinkType(k)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${linkType === k ? C.blue : C.border}`, background: linkType === k ? C.blue : 'transparent', color: linkType === k ? '#fff' : C.muted }}>{t(l)}</div>
          ))}
        </div>

        {linkType === 'klient' && (
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14 }}>
            <option value="">{t("— wybierz klienta —")}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {linkType === 'klient' && (
          <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14, marginTop: -6 }}>
            {t("Kanały zamówień powstają automatycznie w panelu Projekty/Zamówienia — nie trzeba (i nie da się) tworzyć ich tutaj.")}
          </div>
        )}

        {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? t("Tworzę…") : t("+ Utwórz kanał")}
          </button>
        </div>
      </div>
    </div>
  );
}
