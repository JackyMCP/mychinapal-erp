import { useLang } from "../../lib/i18n/LanguageContext";
import { C, fmt } from '../../lib/theme'
import Pill from './Pill'

// Wylicza najbliższe wystąpienia (30 dni) na podstawie aktywnych recurring_payments.
// W przeciwieństwie do pierwszego mockupu NIE zawiera szacunku VAT — to była przykładowa
// liczba bez pokrycia w realnych danych; dodamy ją, gdy ustalimy dokładną metodę szacowania.
function nextOccurrences(items, days = 30) {
  const today = new Date()
  const horizon = new Date(today.getTime() + days * 86400000)
  const out = []
  items.filter(i => i.active).forEach(i => {
    let d = new Date(today.getFullYear(), today.getMonth(), i.day_of_month)
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, i.day_of_month)
    if (d <= horizon) out.push({ date: d, name: i.name, amount: Number(i.amount), category: i.category })
  })
  return out.sort((a, b) => a.date - b.date)
}

export default function TabPrognoza({ items }) {
  const {
    t
  } = useLang();

  const up = nextOccurrences(items)
  const total = up.reduce((s, u) => s + u.amount, 0)
  const fmtDate = d => d.toLocaleDateString('pl-PL')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
        {[{ l: 'Łącznie do zapłaty (30 dni)', v: `−${fmt(total, 0)} PLN`, c: C.red }, { l: 'Liczba płatności', v: `${up.length}`, c: C.blue }].map((k, i) => (
          <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k.l}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>
      {up.length === 0 ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: 'center', fontSize: 12, color: C.muted }}>
          {t(
            "Brak zaplanowanych płatności w ciągu najbliższych 30 dni — prognoza opiera się na aktywnych pozycjach z zakładki „Płatności cykliczne\"."
          )}
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: C.bg }}>
              {['Data', 'Nazwa', 'Kategoria', 'Kwota'].map((h, i) => (
                <th key={i} style={{ textAlign: i === 3 ? 'right' : 'left', padding: '7px 10px', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{t(h)}</th>
              ))}
            </tr></thead>
            <tbody>
              {up.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>{r.category ? <Pill type={r.category} small /> : '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, color: C.red, whiteSpace: 'nowrap' }}>−{fmt(r.amount)} {t("PLN")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: C.navy2 }}>
              <td colSpan={3} style={{ padding: '9px 10px', color: '#fff', fontWeight: 700 }}>{t("Łącznie (30 dni)")}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#FCA5A5', fontSize: 14 }}>−{fmt(total, 0)} {t("PLN")}</td>
            </tr></tfoot>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
