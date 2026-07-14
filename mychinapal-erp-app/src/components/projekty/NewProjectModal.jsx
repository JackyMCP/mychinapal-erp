import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

const label = { fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }
const input = { border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, width: '100%', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }

// clientId + clientName podane -> tworzymy projekt od razu przypisany do tego
// klienta (wywołane z panelu klienta, zakładka Zamówienia). Bez tych propsów
// -> ogólny kreator z listy Projekty, gdzie klienta wybiera się z listy.
export default function NewProjectModal({ clients = [], clientId, clientName, onClose, onCreated }) {
  const { t } = useLang()

  const [orderLabel, setOrderLabel] = useState('')
  const [selectedClientId, setSelectedClientId] = useState(clientId || clients[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const locked = !!clientId

  const handleCreate = async () => {
    if (!orderLabel.trim()) { setError(t('Podaj nazwę / etykietę zamówienia')); return }
    if (!selectedClientId) { setError(t('Wybierz klienta')); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('projects').insert({
      order_label: orderLabel.trim(), client_id: selectedClientId, active: true,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 22, width: 440, maxWidth: '92vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("Nowy projekt / zamówienie")}</div>

        <label style={label}>{t("Nazwa / etykieta zamówienia *")}</label>
        <input style={input} value={orderLabel} onChange={e => setOrderLabel(e.target.value)} placeholder={t("np. ZAM-2026-014 — Powerbanki 30k")} autoFocus />

        <label style={label}>{t("Klient *")}</label>
        {locked ? (
          <div style={{ ...input, background: C.bg, color: C.text2 }}>{clientName}</div>
        ) : (
          <select style={input} value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
            <option value="">{t("— wybierz klienta —")}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <div style={{ fontSize: 10.5, color: C.muted, marginTop: -6, marginBottom: 14 }}>
          {t("Szacowane koszty, zysk i etapy realizacji uzupełnisz zaraz po utworzeniu, w panelu tego zamówienia.")}
        </div>

        {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? t("Tworzę…") : t("+ Utwórz projekt")}
          </button>
        </div>
      </div>
    </div>
  );
}
