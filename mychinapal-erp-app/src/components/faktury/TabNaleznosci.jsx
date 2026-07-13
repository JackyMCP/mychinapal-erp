import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { paymentStatus, daysOverdue } from './utils'

export default function TabNaleznosci({ invoices, currentUserId, onChanged }) {
  const { t } = useLang()

  const unpaid = useMemo(() => invoices
    .filter(inv => !inv.paid_at && inv.typ !== 'pro forma')
    .map(inv => ({ ...inv, _status: paymentStatus(inv), _overdue: daysOverdue(inv) }))
    .sort((a, b) => b._overdue - a._overdue), [invoices])

  const suma = unpaid.reduce((s, i) => s + Number(i.total_gross || i.amount || 0), 0)
  const przeterminowane = unpaid.filter(i => i._status === 'po terminie')
  const sumaPrzeterminowane = przeterminowane.reduce((s, i) => s + Number(i.total_gross || i.amount || 0), 0)
  const sredniCzas = unpaid.length ? Math.round(unpaid.reduce((s, i) => s + i._overdue, 0) / unpaid.length) : 0

  const handleMarkPaid = async (inv) => {
    const { error } = await supabase.from('invoices').update({ paid_at: new Date().toISOString() }).eq('id', inv.id)
    if (error) { alert('Nie udało się oznaczyć jako opłaconej: ' + error.message); return }
    onChanged && onChanged()
  }

  const handleRemind = (inv) => {
    const email = inv.clients?.client_contacts?.[0]?.email
    const subject = encodeURIComponent(`Przypomnienie o płatności — faktura ${inv.number}`)
    const body = encodeURIComponent(`Dzień dobry,\n\nprzypominamy o płatności za fakturę ${inv.number} na kwotę ${Number(inv.total_gross || inv.amount || 0).toFixed(2)} ${inv.currency}, termin płatności: ${inv.due_date || '—'}.\n\nPozdrawiamy,\nMyChinaPal`)
    window.location.href = `mailto:${email || ''}?subject=${subject}&body=${body}`
  }

  const handleTask = async (inv) => {
    const { error } = await supabase.from('tasks').insert({
      title: `Przypomnieć o płatności — faktura ${inv.number} (${inv.clients?.name || ''})`,
      client_id: inv.client_id, assigned_to: currentUserId, assigned_by: currentUserId,
      due_date: new Date().toISOString().slice(0, 10), status: 'todo', priority: 'pilne',
    })
    if (error) { alert('Nie udało się utworzyć zadania: ' + error.message); return }
    alert('Zadanie utworzone.')
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("Suma należności")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginTop: 4 }}>{Math.round(suma).toLocaleString('pl-PL')} PLN</div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("Przeterminowane")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginTop: 4, color: C.red }}>{Math.round(sumaPrzeterminowane).toLocaleString('pl-PL')} PLN</div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("Średnia zwłoka")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginTop: 4 }}>{sredniCzas} {t("dni")}</div>
        </div>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>{t("Faktury nieopłacone")}</div>
        {unpaid.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak nieopłaconych faktur.")}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{['Numer', 'Kontrahent', 'Kwota', 'Termin', 'Zwłoka', ''].map(h => (
            <th key={h} style={{ textAlign: 'left', fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>{t(h)}</th>
          ))}</tr></thead>
          <tbody>
            {unpaid.map(inv => (
              <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 10, fontWeight: 700 }}>{inv.number}</td>
                <td style={{ padding: 10 }}>{inv.clients?.name || '—'}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{Number(inv.total_gross || inv.amount || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {inv.currency}</td>
                <td style={{ padding: 10 }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('pl-PL') : '—'}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: inv._status === 'po terminie' ? C.rlight : C.olight, color: inv._status === 'po terminie' ? C.red : C.orange }}>
                    {inv._status === 'po terminie' ? `${inv._overdue} ${t('dni')}` : `${t('za')} ${Math.abs(inv._overdue)} ${t('dni')}`}
                  </span>
                </td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span onClick={() => handleRemind(inv)} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>✉️ {t("Przypomnij")}</span>
                    <span onClick={() => handleTask(inv)} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>+ {t("Zadanie")}</span>
                    <span onClick={() => handleMarkPaid(inv)} style={{ border: `1px solid #BBF7D0`, background: '#fff', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: C.green }}>✓ {t("Opłacona")}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
