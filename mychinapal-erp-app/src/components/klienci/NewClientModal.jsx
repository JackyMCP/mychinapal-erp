import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { TYP_LABELS } from './utils'

const label = { fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }
const input = { border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }

export default function NewClientModal({ onClose, onCreated }) {
  const { t } = useLang()

  const [name, setName] = useState('')
  const [typ, setTyp] = useState('klient_biznesowy')
  const [nip, setNip] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setError(t('Podaj nazwę klienta')); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('clients').insert({
      name: name.trim(), typ, nip: nip.trim() || null, address: address.trim() || null, notes: notes.trim() || null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    // Przypisujemy twórcę jako opiekuna od razu — inaczej pracownik (nie-zarząd)
    // straciłby dostęp do klienta, którego właśnie sam założył (RLS na SELECT
    // wymaga wpisu w client_assignments albo roli zarząd). Najlepszy wysiłek:
    // błąd tego zapisu nie blokuje utworzenia klienta (zarząd i tak widzi
    // wszystko, więc dla zarządu ten krok jest tylko kosmetyczny).
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) await supabase.from('client_assignments').insert({ client_id: data.id, user_id: user.id })
    onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 22, width: 440, maxWidth: '92vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("Nowy klient")}</div>

        <label style={label}>{t("Nazwa *")}</label>
        <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder={t("np. ACME Sp. z o.o.")} autoFocus />

        <label style={label}>{t("Typ kontrahenta")}</label>
        <select style={input} value={typ} onChange={e => setTyp(e.target.value)}>
          {Object.entries(TYP_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>

        <label style={label}>{t("NIP (opcjonalnie)")}</label>
        <input style={input} value={nip} onChange={e => setNip(e.target.value)} placeholder="000-000-00-00" />

        <label style={label}>{t("Adres (opcjonalnie)")}</label>
        <input style={input} value={address} onChange={e => setAddress(e.target.value)} placeholder={t("ul. Przykładowa 1, 00-000 Warszawa")} />

        <label style={label}>{t("Notatka (opcjonalnie)")}</label>
        <textarea style={{ ...input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("Krótka notatka o kliencie…")} />

        {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? t("Tworzę…") : t("+ Utwórz klienta")}
          </button>
        </div>
      </div>
    </div>
  );
}
