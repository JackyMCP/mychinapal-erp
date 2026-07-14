import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C, fmt } from '../../lib/theme'
import { QUARTERS, Q_LABELS } from './constants'
import useIsMobile from '../../lib/useIsMobile'

const KK_ROWS = [
  { label: 'wpływy (WN+)', color: C.green, bold: false },
  { label: 'wypływy (MA-)', color: C.red, bold: false },
  { label: 'Przychód netto (po VAT)', color: C.blue, bold: false },
  { label: 'Koszty (bezpośr. + operac.)', color: C.red, bold: false },
  { label: 'MARŻA OPERACYJNA', color: null, bold: true },
  { label: 'Podatki (CIT/VAT/ZUS)', color: C.purple, bold: false },
  { label: 'Nierozliczonych', color: C.orange, bold: false, count: true },
  { label: 'Rozliczonych całkowicie', color: C.green, bold: false, count: true },
]

// kk: { [row_label]: { [quarter|'razem']: value } }
// stanKont: [{ label, cur, vals: [7 wartości] }]
export default function TabKontrolaKasy({ kk, stanKont }) {
  const {
    t
  } = useLang();
  const isMobile = useIsMobile()

  const [selQ, setSelQ] = useState('Q2_2026')
  const qi = QUARTERS.indexOf(selQ)
  const getVal = (label, q) => (kk[label] && kk[label][q]) || 0
  const marzaSeries = QUARTERS.map(q => getVal('MARŻA OPERACYJNA', q))

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{t("Kwartał:")}</span>
        {[...QUARTERS.map((q, i) => ({ k: q, l: Q_LABELS[i] })), { k: 'razem', l: 'RAZEM' }].map(({ k, l }) => (
          <div key={k} onClick={() => setSelQ(k)} style={{
            padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${selQ === k ? C.blue : C.border}`,
            background: selQ === k ? C.blue : 'transparent', color: selQ === k ? '#fff' : C.muted,
          }}>{t(l)}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: C.text }}>
            {t("📊 Przepływy finansowe —")} {selQ === 'razem' ? t("WSZYSTKIE KWARTAŁY") : Q_LABELS[qi]}
          </div>
          {KK_ROWS.map((r, i) => {
            const val = getVal(r.label, selQ)
            const isMarza = r.label === 'MARŻA OPERACYJNA'
            const color = isMarza ? (val >= 0 ? C.green : C.red) : r.color
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < KK_ROWS.length - 1 ? `1px solid ${C.border}` : 'none', borderTop: r.bold && i > 0 ? `1.5px solid ${C.border}` : 'none', marginTop: r.bold && i > 0 ? 4 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: r.bold ? 700 : 400, color: r.bold ? C.text : C.text2 }}>{t(r.label)}</span>
                <span style={{ fontSize: r.bold ? 15 : 12, fontWeight: 700, color }}>
                  {r.count ? val : ((val > 0 && !r.label.includes('ypływ')) ? '+' : '') + fmt(val, 0) + ' PLN'}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{t("🏦 Stan kont na koniec")} {selQ === 'razem' ? t("Q3 2026 (ostatni)") : Q_LABELS[qi]}</div>
            {stanKont.filter(s => s.cur !== 'EUR').map((s, i, arr) => {
              const vIdx = selQ === 'razem' ? 6 : qi
              const val = s.vals[vIdx]
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{t(s.label)}</div>
                    <div style={{ fontSize: 9.5, color: C.muted }}>{s.cur}</div>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: val < 0 ? C.red : val > 0 ? C.blue : C.muted }}>{fmt(val)}</span>
                </div>
              )
            })}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', overflowX: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: C.text }}>{t("Marża operacyjna per kwartał")}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead><tr style={{ background: C.bg }}>
                {Q_LABELS.map(q => <th key={q} style={{ padding: '4px 6px', fontWeight: 700, color: C.muted, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 9 }}>{q}</th>)}
                <th style={{ padding: '4px 6px', fontWeight: 700, color: C.navy, textAlign: 'right', fontSize: 9 }}>{t("RAZEM")}</th>
              </tr></thead>
              <tbody><tr>
                {marzaSeries.map((m, i) => (
                  <td key={i} style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: m > 0 ? C.green : C.red, whiteSpace: 'nowrap', fontSize: 10.5 }}>
                    {m > 0 ? '+' : ''}{Math.abs(m) >= 1000 ? (m / 1000).toFixed(1) + 'k' : fmt(m, 0)}
                  </td>
                ))}
                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: getVal('MARŻA OPERACYJNA', 'razem') > 0 ? C.green : C.red, whiteSpace: 'nowrap', fontSize: 10.5 }}>
                  {(() => { const m = getVal('MARŻA OPERACYJNA', 'razem'); return (m > 0 ? '+' : '') + (Math.abs(m) >= 1000 ? (m / 1000).toFixed(1) + 'k' : fmt(m, 0)) })()}
                </td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
