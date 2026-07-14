import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C, fmt, fmtPct } from '../../lib/theme'
import Pill from './Pill'

// marzaK: [{k, client_id, p, z, t, c, m, mp, vn, vi}]           per kontrahent
// marzaZ: [{k, client_id, z: order_label, project_id, p, zk, t, c, vi, m, s, active}]  per zlecenie
export default function TabMarza({ marzaK, marzaZ, goClient }) {
  const {
    t
  } = useLang();

  const [view, setView] = useState('kontrahent')
  const [sortBy, setSortBy] = useState('m')
  const [filterClient, setFilterClient] = useState('')

  const sortedK = [...marzaK].filter(r => r.k && r.k.toUpperCase() !== 'RAZEM' && (r.p !== 0 || r.m !== 0)).sort((a, b) => {
    if (sortBy === 'm') return b.m - a.m
    if (sortBy === 'p') return b.p - a.p
    if (sortBy === 'mp') return b.mp - a.mp
    return a.k.localeCompare(b.k)
  })

  const filteredZ = marzaZ.filter(r => r.k && (r.p !== 0 || r.zk !== 0 || r.m !== 0) && (filterClient ? r.k === filterClient : true))
  const clients = [...new Set(marzaZ.map(r => r.k).filter(Boolean))].sort()

  const totP = sortedK.reduce((s, r) => s + r.p, 0)
  const totZ = sortedK.reduce((s, r) => s + r.z, 0)
  const totT = sortedK.reduce((s, r) => s + r.t, 0)
  const totC = sortedK.reduce((s, r) => s + r.c, 0)
  const totM = sortedK.reduce((s, r) => s + r.m, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {[{ k: 'kontrahent', l: 'Per kontrahent' }, { k: 'zlecenie', l: 'Per zlecenie' }].map(({ k, l }) => (
          <div key={k} onClick={() => setView(k)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${view === k ? C.blue : C.border}`, background: view === k ? C.blue : 'transparent', color: view === k ? '#fff' : C.muted }}>{t(l)}</div>
        ))}
        {view === 'kontrahent' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', fontSize: 10.5, color: C.muted }}>
            {t("Sortuj:")}
            {[{ k: 'm', l: 'Marża PLN' }, { k: 'p', l: 'Przychód' }, { k: 'mp', l: 'Marża %' }, { k: 'k', l: 'A→Z' }].map(({ k, l }) => (
              <div key={k} onClick={() => setSortBy(k)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 600, border: `1px solid ${sortBy === k ? C.blue : C.border}`, background: sortBy === k ? C.blight : 'transparent', color: sortBy === k ? C.blue : C.muted }}>{t(l)}</div>
            ))}
          </div>
        )}
        {view === 'zlecenie' && (
          <div style={{ marginLeft: 'auto' }}>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, outline: 'none' }}>
              <option value="">{t("— wszyscy klienci —")}</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      {view === 'kontrahent' && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr style={{ background: C.bg }}>
              {[['left', 'Kontrahent'], ['right', 'Przychód netto'], ['right', 'Zakup Chiny'], ['right', 'Transport'], ['right', 'Cło/Odprawa'], ['right', 'Marża PLN'], ['right', 'Marża %'], ['right', 'VAT należny'], ['right', 'VAT import']].map(([a, h], i) => (
                <th key={i} style={{ textAlign: a, padding: '7px 10px', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{t(h)}</th>
              ))}
            </tr></thead>
            <tbody>
              {sortedK.map((r, i) => (
                <tr key={i} style={{ background: r.m < 0 ? '#FEF2F2' : i % 2 === 0 ? C.white : '#FAFBFD' }} onMouseEnter={e => e.currentTarget.style.background = C.blight} onMouseLeave={e => e.currentTarget.style.background = r.m < 0 ? '#FEF2F2' : i % 2 === 0 ? C.white : '#FAFBFD'}>
                  <td onClick={() => goClient && r.client_id && goClient(r.client_id)} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12, cursor: goClient && r.client_id ? 'pointer' : 'default', color: goClient && r.client_id ? C.blue : 'inherit', textDecoration: goClient && r.client_id ? 'underline' : 'none' }}>{r.k}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.blue, fontWeight: 600 }}>{fmt(r.p, 0)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.red }}>{r.z > 0 ? fmt(r.z, 0) : '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: '#C2410C' }}>{r.t > 0 ? fmt(r.t, 0) : '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: '#DB2777' }}>{r.c > 0 ? fmt(r.c, 0) : '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, fontSize: 13, color: r.m > 0 ? C.green : C.red }}>{r.m > 0 ? '+' : ''}{fmt(r.m, 0)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, color: r.mp > 0.1 ? C.green : r.mp > 0 ? C.orange : C.red }}>
                    {fmtPct(r.mp)}
                    <div style={{ background: C.border, borderRadius: 2, height: 3, marginTop: 3, overflow: 'hidden', width: 60 }}>
                      <div style={{ width: `${Math.min(Math.abs(r.mp) * 100 * 2, 100)}%`, height: '100%', background: r.mp > 0.1 ? C.green : r.mp > 0 ? C.orange : C.red, borderRadius: 2 }}></div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.purple }}>{r.vn > 0 ? fmt(r.vn, 0) : '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: r.vi !== 0 ? C.blue : C.muted }}>{r.vi !== 0 ? fmt(r.vi, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: C.navy2 }}>
              <td style={{ padding: '9px 10px', color: '#fff', fontWeight: 700 }}>{t("RAZEM (")}{sortedK.length} {t("klientów)")}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#86EFAC', fontWeight: 700 }}>{fmt(totP, 0)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#FCA5A5', fontWeight: 700 }}>{fmt(totZ, 0)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#FED7AA', fontWeight: 700 }}>{fmt(totT, 0)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#FBCFE8', fontWeight: 700 }}>{fmt(totC, 0)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: totM > 0 ? '#86EFAC' : '#FCA5A5' }}>{totM > 0 ? '+' : ''}{fmt(totM, 0)}</td>
              <td colSpan={3}></td>
            </tr></tfoot>
          </table>
        </div>
        </div>
      )}
      {view === 'zlecenie' && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr style={{ background: C.bg }}>
              {[['left', 'Kontrahent'], ['left', 'Zlecenie'], ['right', 'Przychód'], ['right', 'Zakup'], ['right', 'Transport'], ['right', 'Cło'], ['right', 'VAT import'], ['right', 'Marża PLN'], ['left', 'Etap zamówienia']].map(([a, h], i) => (
                <th key={i} style={{ textAlign: a, padding: '7px 10px', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{t(h)}</th>
              ))}
            </tr></thead>
            <tbody>
              {filteredZ.map((r, i) => (
                <tr key={i} style={{ background: r.m < 0 ? '#FEF2F2' : C.white }} onMouseEnter={e => e.currentTarget.style.background = C.blight} onMouseLeave={e => e.currentTarget.style.background = r.m < 0 ? '#FEF2F2' : C.white}>
                  <td onClick={() => goClient && r.client_id && goClient(r.client_id)} style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 11.5, cursor: goClient && r.client_id ? 'pointer' : 'default', color: goClient && r.client_id ? C.blue : 'inherit', textDecoration: goClient && r.client_id ? 'underline' : 'none' }}>{r.k}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 10.5 }}>{r.z}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.blue, fontWeight: 600 }}>{r.p > 0 ? fmt(r.p, 0) : '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.red }}>{r.zk > 0 ? fmt(r.zk, 0) : '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: '#C2410C' }}>{r.t > 0 ? fmt(r.t, 0) : '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: '#DB2777' }}>{r.c > 0 ? fmt(r.c, 0) : '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.blue }}>{r.vi > 0 ? fmt(r.vi, 0) : '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, color: r.m > 0 ? C.green : C.red }}>{r.m > 0 ? '+' : ''}{fmt(r.m, 0)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}` }}>{r.s ? <Pill type={r.s} small /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
