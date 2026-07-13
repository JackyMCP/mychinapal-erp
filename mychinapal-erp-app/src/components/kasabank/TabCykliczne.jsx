import { useLang } from "../../lib/i18n/LanguageContext";
import { C, fmt } from '../../lib/theme'
import Pill from './Pill'

// items: wiersze z tabeli recurring_payments (name, amount, day_of_month, category, active)
export default function TabCykliczne({ items }) {
  const {
    t
  } = useLang();

  const active = items.filter(i => i.active)
  const total = active.reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
        {[{ l: 'Łącznie / miesiąc', v: `−${fmt(total)} PLN`, c: C.red }, { l: 'Prognoza roczna', v: `−${fmt(total * 12, 0)} PLN`, c: C.red }, { l: 'Liczba pozycji', v: `${active.length}`, c: C.blue }].map((k, i) => (
          <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k.l}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: 'center', fontSize: 12, color: C.muted }}>
          {t("Brak zdefiniowanych płatności cyklicznych. Dodaj je w tabeli")} <code>{t("recurring_payments")}</code> {t(
            "(np. ZUS, obsługa księgowa, wynajem biura, wynagrodzenia) — pojawią się tu automatycznie."
          )}
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: C.bg }}>
              {['Nazwa', 'Kategoria', 'Dzień', 'Kwota/mies.', 'Kwota/rok', 'Status'].map((h, i) => (
                <th key={i} style={{ textAlign: i > 1 ? 'right' : i === 1 ? 'left' : 'left', padding: '7px 10px', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{t(h)}</th>
              ))}
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}` }}>{r.category ? <Pill type={r.category} small /> : '—'}</td>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.muted, fontSize: 11 }}>{r.day_of_month}{t(". każdego")}</td>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, color: C.red }}>−{fmt(r.amount)}</td>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.muted }}>−{fmt(r.amount * 12, 0)}</td>
                  <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 10, background: r.active ? C.glight : C.bg, color: r.active ? C.green : C.muted, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{r.active ? t("● Aktywna") : t("○ Nieaktywna")}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: C.navy2 }}>
              <td style={{ padding: '9px 10px', color: '#fff', fontWeight: 700 }}>{t("Łącznie (aktywne)")}</td><td></td><td></td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#FCA5A5', fontSize: 14 }}>−{fmt(total)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#FCA5A5' }}>−{fmt(total * 12, 0)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
