import { C, fmt, fmtPct } from '../../lib/theme'

const box = { background: C.bg, borderRadius: 10, padding: '12px 14px' }
const lbl = { fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }
const val = { fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, marginTop: 3 }

export default function TabFinanse({ marza }) {
  if (!marza) return <div style={{ fontSize: 11, color: C.muted }}>Brak danych finansowych — ten klient nie ma jeszcze żadnych transakcji przypisanych w Kasa &amp; Bank.</div>
  const przychod = Number(marza.przychod) || 0
  const zakup = Number(marza.zakup) || 0
  const transport = Number(marza.transport) || 0
  const clo = Number(marza.clo) || 0
  const marzaVal = Number(marza.marza) || 0
  const marzaPct = Number(marza.marza_pct) || 0
  const vatNalezny = Number(marza.vat_nalezny) || 0
  const vatImport = Number(marza.vat_import) || 0

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
        <div style={box}><div style={lbl}>Przychód</div><div style={val}>{fmt(przychod, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>Zakup towaru</div><div style={val}>{fmt(zakup, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>Transport</div><div style={val}>{fmt(transport, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>Cło</div><div style={val}>{fmt(clo, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>Marża</div><div style={{ ...val, color: marzaVal >= 0 ? C.green : C.red }}>{fmt(marzaVal, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>Marża %</div><div style={val}>{fmtPct(marzaPct)}</div></div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', margin: '16px 0 8px' }}>VAT</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        <div style={box}><div style={lbl}>VAT należny (od sprzedaży)</div><div style={val}>{fmt(vatNalezny, 0)} PLN</div></div>
        <div style={box}><div style={lbl}>VAT naliczony (odprawa celna)</div><div style={val}>{fmt(vatImport, 0)} PLN</div></div>
      </div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>Dane liczone na żywo z Kasa &amp; Bank (widok v_marza_klient) — te same liczby co w module Marża.</div>
    </div>
  )
}
