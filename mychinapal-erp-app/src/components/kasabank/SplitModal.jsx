import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useState } from 'react'
import { C, fmt } from '../../lib/theme'
import { CATEGORIES } from './constants'
import useIsMobile from '../../lib/useIsMobile'

// "Podział kwoty" — jedna transakcja bankowa (np. jeden przelew do firmy
// transportowej pokrywający kilku klientów, albo jedna wpłata do fabryki w
// Chinach za kilka różnych towarów) może zostać rozbita na kilka pozycji:
// klient, zamówienie, kwota, opis (za jaki towar), opcjonalnie powiązana
// faktura/PI i etap płatności (Fabryka/Magazyn). Zastępuje to stary,
// ręczny mechanizm pustych "wierszy pomocniczych" (S-) w tabeli Transakcji —
// podział mieszka teraz w jednym miejscu, otwieranym z kafelka na wierszu
// transakcji.
const blankLine = () => ({
  key: Math.random().toString(36).slice(2),
  id: null,
  client_id: '', project_id: '', amount: '', description: '', category: '',
  invoice_id: '', payment_stage: '',
})

export default function SplitModal({ tx, clients, projects, invoices = [], existingSplits = [], onSave, onClose }) {
  const { t } = useLang()
  const isMobile = useIsMobile()

  const [lines, setLines] = useState(() =>
    existingSplits.length
      ? existingSplits.map(s => ({
          key: s.id, id: s.id,
          client_id: s.client_id || '', project_id: s.project_id || '',
          amount: s.amount != null ? String(Math.abs(Number(s.amount))) : '',
          description: s.description || '', category: s.category || '',
          invoice_id: s.invoice_id || '', payment_stage: s.payment_stage || '',
        }))
      : [blankLine()]
  )
  const [saving, setSaving] = useState(false)

  const sign = Number(tx.amount) < 0 ? -1 : 1
  const total = Math.abs(Number(tx.amount) || 0)
  const assigned = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines])
  const remaining = Math.round((total - assigned) * 100) / 100
  const matches = Math.abs(remaining) < 0.01

  const updateLine = (key, patch) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  const removeLine = (key) => setLines(prev => prev.filter(l => l.key !== key))
  const addLine = () => setLines(prev => [...prev, blankLine()])

  const projectsFor = (clientId) => projects.filter(p => p.client_id === clientId)
  const invoicesFor = (clientId, projectId) => invoices.filter(inv =>
    (projectId ? inv.project_id === projectId : clientId ? inv.client_id === clientId : true)
  )

  const handleSave = async () => {
    const valid = lines.filter(l => l.client_id && Number(l.amount) > 0)
    if (valid.length === 0) { onClose(); return }
    setSaving(true)
    await onSave(tx.id, valid.map(l => ({
      id: l.id,
      client_id: l.client_id || null,
      project_id: l.project_id || null,
      invoice_id: l.invoice_id || null,
      amount: sign * Math.abs(Number(l.amount) || 0),
      description: l.description || null,
      category: l.category || null,
      payment_stage: (l.client_id && l.project_id) ? (l.payment_stage || null) : null,
    })))
    setSaving(false)
  }

  const field = { border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 7px', fontSize: 10.5, width: '100%', outline: 'none', boxSizing: 'border-box' }
  const label = { fontSize: 9, fontWeight: 700, display: 'block', marginBottom: 3, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 24, width: 780, maxWidth: '96vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("🔀 Podział kwoty")}</div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{tx.contractor}</span>
          <span style={{ fontWeight: 700, color: tx.amount > 0 ? C.green : C.red }}>{tx.amount > 0 ? '+' : ''}{fmt(tx.amount)} {tx.currency || t("PLN")}</span>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
          {t("Rozbij tę transakcję na kilka pozycji — np. gdy jedna płatność pokrywa kilku klientów/zamówień. Suma pozycji powinna zgadzać się z całą kwotą transakcji.")}
        </div>

        {lines.map((l, i) => {
          const cProjects = projectsFor(l.client_id)
          const cInvoices = invoicesFor(l.client_id, l.project_id)
          return (
            <div key={l.key} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, marginBottom: 10, position: 'relative', background: C.bg }}>
              <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, color: C.muted, fontWeight: 700 }}>#{i + 1}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.3fr .8fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={label}>{t("Klient")}</label>
                  <select style={field} value={l.client_id} onChange={e => updateLine(l.key, { client_id: e.target.value, project_id: '', invoice_id: '' })}>
                    <option value="">{t("— wybierz —")}</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>{t("Zamówienie")}</label>
                  <select style={field} value={l.project_id} onChange={e => updateLine(l.key, { project_id: e.target.value, invoice_id: '' })} disabled={!l.client_id}>
                    <option value="">{t("— brak / nie dotyczy —")}</option>
                    {cProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>{t("Kwota")}</label>
                  <input type="number" step="0.01" style={field} value={l.amount} onChange={e => updateLine(l.key, { amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr .9fr 1.1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={label}>{t("Opis (za jaki towar/usługę)")}</label>
                  <input style={field} value={l.description} onChange={e => updateLine(l.key, { description: e.target.value })} placeholder={t("np. transport kontenera #3")} />
                </div>
                <div>
                  <label style={label}>{t("Kategoria")}</label>
                  <select style={field} value={l.category} onChange={e => updateLine(l.key, { category: e.target.value })}>
                    <option value="">{t("— brak —")}</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>{t("Powiązana faktura / PI")}</label>
                  <select style={field} value={l.invoice_id} onChange={e => updateLine(l.key, { invoice_id: e.target.value })}>
                    <option value="">{t("— brak —")}</option>
                    {cInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.number}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>{t("Etap płatności (Fabryka / Magazyn)")}</label>
                  <select style={field} value={l.payment_stage} onChange={e => updateLine(l.key, { payment_stage: e.target.value })} disabled={!l.client_id || !l.project_id}>
                    <option value="">{t("— nie dotyczy —")}</option>
                    <option value="zaliczka">{t("Zaliczka → „Fabryka”")}</option>
                    <option value="doplata_koncowa">{t("Dopłata końcowa → „Magazyn”")}</option>
                  </select>
                </div>
                <button onClick={() => removeLine(l.key)} title={t("Usuń pozycję")}
                  style={{ marginTop: 14, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.rmid}`, background: C.rlight, color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {t("✕")}
                </button>
              </div>
            </div>
          )
        })}

        <button onClick={addLine} style={{ padding: '7px 14px', borderRadius: 7, border: `1px dashed ${C.border}`, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: C.blue, marginBottom: 14 }}>
          {t("+ Dodaj pozycję")}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: matches ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${matches ? '#BBF7D0' : '#FDE68A'}`, marginBottom: 14, fontSize: 11 }}>
          <span style={{ color: C.muted }}>{t("Przypisano")}: <strong style={{ color: C.text }}>{fmt(assigned, 2)}</strong> {t("z")} <strong style={{ color: C.text }}>{fmt(total, 2)}</strong> {tx.currency || t("PLN")}</span>
          <span style={{ fontWeight: 700, color: matches ? C.green : C.orange }}>
            {matches ? `✓ ${t("zgadza się")}` : `${remaining > 0 ? t("pozostało") : t("przekroczono o")} ${fmt(Math.abs(remaining), 2)}`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: saving ? .6 : 1 }}>
            {saving ? t("Zapisywanie…") : t("💾 Zapisz podział")}
          </button>
        </div>
      </div>
    </div>
  );
}
