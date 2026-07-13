import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }
const fieldWrap = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }
const label = { display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }
const input = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, boxSizing: 'border-box' }

const KEYS = ['company_name', 'company_nip', 'company_address', 'company_bank_account', 'ksef_token', 'ksef_env', 'ksef_auto_send']

export default function TabKSeF({ invoices, onCompanySettingsChanged }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('company_settings').select('*').in('key', KEYS)
    setSettings(Object.fromEntries((data || []).map(r => [r.key, r.value])))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const set = (k, v) => setSettings(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    const rows = KEYS.map(k => ({ key: k, value: settings[k] ?? '' }))
    const { error } = await supabase.from('company_settings').upsert(rows, { onConflict: 'key' })
    setSaving(false)
    if (error) { toast.error('Nie udało się zapisać ustawień: ' + error.message); return }
    onCompanySettingsChanged && onCompanySettingsChanged()
  }

  const log = invoices.filter(i => i.ksef_status).sort((a, b) => new Date(b.ksef_sent_at || 0) - new Date(a.ksef_sent_at || 0)).slice(0, 20)

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Dane sprzedawcy (na fakturach)")}</div>
        <div style={fieldWrap}>
          <div><label style={label}>{t("Nazwa firmy")}</label><input style={input} value={settings.company_name || ''} onChange={e => set('company_name', e.target.value)} /></div>
          <div><label style={label}>{t("NIP firmy")}</label><input style={input} value={settings.company_nip || ''} onChange={e => set('company_nip', e.target.value)} /></div>
          <div><label style={label}>{t("Adres")}</label><input style={input} value={settings.company_address || ''} onChange={e => set('company_address', e.target.value)} /></div>
          <div><label style={label}>{t("Numer konta bankowego")}</label><input style={input} value={settings.company_bank_account || ''} onChange={e => set('company_bank_account', e.target.value)} /></div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Połączenie z KSeF")}</div>
        <div style={fieldWrap}>
          <div><label style={label}>{t("Token KSeF")}</label><input type="password" style={input} value={settings.ksef_token || ''} onChange={e => set('ksef_token', e.target.value)} placeholder="••••••••••••••••••••" /></div>
          <div><label style={label}>{t("Środowisko")}</label>
            <select style={input} value={settings.ksef_env || 'test'} onChange={e => set('ksef_env', e.target.value)}>
              <option value="test">{t("Testowe")}</option>
              <option value="prod">{t("Produkcyjne")}</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14 }}>
          {t("Token generujesz samodzielnie w portalu ksef.podatki.gov.pl (zakładka Tokeny) — to jednorazowa czynność wymagająca Twojego podpisu/profilu zaufanego, nie da się jej wykonać automatycznie.")}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.ksef_auto_send === 'true'} onChange={e => set('ksef_auto_send', e.target.checked ? 'true' : 'false')} />
          {t("Automatyczna wysyłka nowych faktur sprzedaży do KSeF")}
        </label>
        <button onClick={handleSave} disabled={saving} style={{ border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? .6 : 1 }}>
          {saving ? t("Zapisywanie…") : t("Zapisz ustawienia")}
        </button>
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Log ostatnich wysyłek")}</div>
        {log.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak jeszcze żadnych prób wysyłki.")}</div>}
        <div style={{ fontFamily: 'monospace', fontSize: 11, background: C.navy, color: '#9BE6C4', borderRadius: 10, padding: '12px 14px', lineHeight: 1.8, maxHeight: 220, overflowY: 'auto' }}>
          {log.map(inv => (
            <div key={inv.id} style={{ color: inv.ksef_status === 'error' ? '#FCA5A5' : '#9BE6C4' }}>
              {inv.ksef_sent_at ? new Date(inv.ksef_sent_at).toLocaleString('pl-PL') : '—'} &nbsp; {inv.number} → {inv.ksef_status === 'sent' ? `wysłano OK, nr KSeF ${inv.ksef_number || '—'}` : `błąd: ${inv.ksef_error || 'nieznany'}`}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
