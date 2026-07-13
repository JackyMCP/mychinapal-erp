import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { paymentStatus, daysOverdue } from './utils'
import { useUI } from '../../lib/ui'

const chip = (active) => ({ padding: '7px 13px', borderRadius: 8, border: `1px solid ${active ? C.navy : C.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? C.navy : '#fff', color: active ? '#fff' : C.text2 })

export default function TabRejestr({ invoices, loading, onChanged, onRetryKsef }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const filtered = useMemo(() => invoices.filter(inv => {
    if (filter !== 'all' && inv.typ !== filter) return false
    if (search && !`${inv.number} ${inv.clients?.name || ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [invoices, filter, search])

  const handleDownload = async (inv) => {
    if (!inv.pdf_path) { toast.error('Ta faktura nie ma jeszcze wygenerowanego PDF.'); return }
    const { data, error } = await supabase.storage.from('faktury').createSignedUrl(inv.pdf_path, 300)
    if (error) { toast.error('Nie udało się pobrać PDF: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleRetry = async (inv) => {
    setBusyId(inv.id)
    await onRetryKsef(inv)
    setBusyId(null)
  }

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={chip(filter === 'all')} onClick={() => setFilter('all')}>{t("Wszystkie")}</div>
          <div style={chip(filter === 'sprzedaży')} onClick={() => setFilter('sprzedaży')}>{t("Sprzedażowe")}</div>
          <div style={chip(filter === 'zaliczkowa')} onClick={() => setFilter('zaliczkowa')}>{t("Zaliczkowe")}</div>
          <div style={chip(filter === 'pro forma')} onClick={() => setFilter('pro forma')}>{t("Pro forma")}</div>
          <div style={chip(filter === 'korygująca')} onClick={() => setFilter('korygująca')}>{t("Korygujące")}</div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj numeru, klienta…")}
          style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11.5, maxWidth: 220 }} />
      </div>

      {filtered.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 16, textAlign: 'center' }}>{t("Brak faktur do wyświetlenia.")}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Numer', 'Kontrahent', 'Zamówienie', 'Data', 'Kwota brutto', 'Płatność', 'KSeF', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(inv => {
            const status = paymentStatus(inv)
            const overdue = daysOverdue(inv)
            return (
              <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 10, fontWeight: 700 }}>{inv.number}</td>
                <td style={{ padding: 10 }}>{inv.clients?.name || '—'}</td>
                <td style={{ padding: 10 }}>{inv.projects?.order_label || '—'}</td>
                <td style={{ padding: 10 }}>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('pl-PL') : '—'}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{Number(inv.total_gross || inv.amount || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {inv.currency}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: status === 'opłacona' ? C.glight : status === 'po terminie' ? C.rlight : C.olight, color: status === 'opłacona' ? C.green : status === 'po terminie' ? C.red : C.orange }}>
                    {status === 'po terminie' ? `${overdue} ${t('dni po terminie')}` : t(status)}
                  </span>
                </td>
                <td style={{ padding: 10 }}>
                  {inv.ksef_status === 'sent' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.blight, color: C.blue }}>✓ {inv.ksef_number || t('wysłano')}</span>}
                  {inv.ksef_status === 'error' && <span title={inv.ksef_error || ''} style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.rlight, color: C.red }}>✕ {t('błąd wysyłki')}</span>}
                  {!inv.ksef_status && <span style={{ fontSize: 9.5, color: C.muted }}>—</span>}
                </td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span onClick={() => handleDownload(inv)} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: C.text2 }}>PDF</span>
                    {inv.ksef_status === 'error' && (
                      <span onClick={() => handleRetry(inv)} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: C.blue, opacity: busyId === inv.id ? .5 : 1 }}>{busyId === inv.id ? '…' : t('Ponów')}</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
