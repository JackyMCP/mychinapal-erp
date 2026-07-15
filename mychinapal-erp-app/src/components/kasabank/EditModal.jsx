import { useLang } from "../../lib/i18n/LanguageContext";
import { useState, useMemo, useEffect } from 'react'
import { C, fmt } from '../../lib/theme'
import { CATEGORIES, FLOW_TYPES } from './constants'
import useIsMobile from '../../lib/useIsMobile'

const STATUSES = ['ROZLICZONO CAŁKOWICIE', 'NIE ROZLICZONO', 'NIE PODLEGA', 'W TRAKCIE']

export default function EditModal({ tx, clients, projects, onSave, onClose, categories = CATEGORIES, vatRateOptions = [0, 5, 8, 23] }) {
  const {
    t
  } = useLang();
  const isMobile = useIsMobile()

  const [clientId, setClientId] = useState(tx.client_id || '')
  const [projectId, setProjectId] = useState(tx.project_id || '')
  const [cat, setCat] = useState(tx.category || '')
  const [flow, setFlow] = useState(tx.flow_type || '')
  const [status, setStatus] = useState(tx.status || '')
  const [notes, setNotes] = useState(tx.notes || '')
  const [vat_rate, setVatRate] = useState(tx.vat_rate || 0)
  const [txDate, setTxDate] = useState(tx.date || '')
  const [paymentStage, setPaymentStage] = useState(tx.payment_stage || '')

  const clientProjects = useMemo(
    () => projects.filter(p => p.client_id === clientId),
    [projects, clientId]
  )

  useEffect(() => {
    if (projectId && !clientProjects.some(p => p.id === projectId)) setProjectId('')
  }, [clientId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 12, padding: 24, width: 520, maxWidth: '92vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("Edytuj transakcję")}</div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{tx.id.slice(0, 8)}</span>
          <span style={{ fontWeight: 700, color: tx.amount > 0 ? C.green : C.red }}>{tx.amount > 0 ? '+' : ''}{fmt(tx.amount)} {tx.currency || t("PLN")}</span>
          <span style={{ background: C.bg, padding: '1px 6px', borderRadius: 4 }}>{tx.account}</span>
        </div>
        <div style={{ background: C.bg, borderRadius: 6, padding: '7px 10px', fontSize: 10.5, color: C.text2, marginBottom: 14, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>{tx.contractor}<br />{t(tx.desc)}</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: !txDate ? C.red : C.text }}>
            {t("Data transakcji")}{!txDate && ` — ${t('brak daty, uzupełnij')}`}
          </label>
          <input type="date" style={{ border: `1px solid ${!txDate ? C.red : C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none', boxSizing: 'border-box' }}
            value={txDate || ''} onChange={e => setTxDate(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: C.text }}>{t("Przypisanie (klient)")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">{t("— brak (wydatek wewnętrzny) —")}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: C.text }}>{t("Zamówienie")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!clientId}>
              <option value="">{t("— brak / nie dotyczy —")}</option>
              {clientProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Kategoria źródłowa")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">{t("— brak —")}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Typ wpływu")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={flow} onChange={e => setFlow(e.target.value)}>
              <option value="">{t("— wybierz —")}</option>
              {FLOW_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Status rozliczenia")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Stawka VAT (%)")}</label>
            <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
              value={vat_rate} onChange={e => setVatRate(Number(e.target.value))}>
              {vatRateOptions.map(v => <option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Etap płatności za towar (Fabryka / Magazyn)")}</label>
          <select style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none' }}
            value={paymentStage} onChange={e => setPaymentStage(e.target.value)} disabled={!clientId || !projectId}>
            <option value="">{t("— nie dotyczy —")}</option>
            <option value="zaliczka">{t("Zaliczka za produkcję towaru → przenosi zamówienie do „Fabryka”")}</option>
            <option value="doplata_koncowa">{t("Dopłata końcowa, towar gotowy → przenosi z „Fabryki” do magazynu")}</option>
          </select>
          {(!clientId || !projectId) && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{t("Wymaga przypisania klienta i zamówienia powyżej.")}</div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Uwagi")}</label>
          <textarea style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, width: '100%', outline: 'none', resize: 'vertical', minHeight: 56 }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("Dodaj notatkę...")} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: C.muted, marginRight: 'auto' }}>{t("Zmiany zapisują się od razu w bazie")}</span>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={() => onSave(tx.id, { client_id: clientId || null, project_id: projectId || null, category: cat || null, flow_type: flow || null, status: status || null, notes: notes || null, vat_rate, tx_date: txDate || null, payment_stage: (clientId && projectId) ? (paymentStage || null) : null })}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff' }}>
            {t("💾 Zapisz zmiany")}
          </button>
        </div>
      </div>
    </div>
  );
}
