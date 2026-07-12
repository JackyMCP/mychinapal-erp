import { C, fmt, fmtPct } from '../../lib/theme'
import { TYP_LABELS } from './utils'

const label = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 8 }
const statBox = { background: C.bg, borderRadius: 10, padding: '12px 14px' }
const statLabel = { fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }
const statVal = { fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 3 }
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}` }
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })

export default function TabPrzeglad({ client, marza, projects, contacts, lastContactDays }) {
  const przychod = Number(marza?.przychod) || 0
  const marzaVal = Number(marza?.marza) || 0
  const marzaPct = Number(marza?.marza_pct) || 0
  const contactLabel = lastContactDays === null || lastContactDays === undefined
    ? 'brak danych'
    : lastContactDays === 0 ? 'dzisiaj' : `${lastContactDays} dni temu`
  const contactColor = (lastContactDays === null || lastContactDays === undefined || lastContactDays > 45) ? C.red
    : lastContactDays <= 14 ? C.green : C.orange
  const primary = contacts && contacts[0]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <div style={statBox}><div style={statLabel}>Obrót YTD</div><div style={statVal}>{fmt(przychod, 0)} PLN</div></div>
        <div style={statBox}><div style={statLabel}>Marża YTD</div><div style={{ ...statVal, color: C.green }}>{fmt(marzaVal, 0)} PLN</div></div>
        <div style={statBox}><div style={statLabel}>Marża %</div><div style={statVal}>{fmtPct(marzaPct)}</div></div>
        <div style={statBox}><div style={statLabel}>Ostatni kontakt</div><div style={{ ...statVal, fontSize: 14, color: contactColor }}>{contactLabel}</div></div>
      </div>

      <div style={label}>Dane kontrahenta</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 12, marginBottom: 22 }}>
        <div><div style={label}>NIP</div>{client.nip || '—'}</div>
        <div><div style={label}>Typ</div>{TYP_LABELS[client.typ] || client.typ || '—'}</div>
        <div><div style={label}>Kontakt</div>{primary?.email || '—'}</div>
        <div><div style={label}>Telefon</div>{primary?.phone || '—'}</div>
        <div><div style={label}>Adres</div>{client.address || '—'}</div>
        <div><div style={label}>KRS</div>{client.krs || '—'}</div>
      </div>

      <div style={label}>Ostatnie zamówienia</div>
      {projects.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>Brak zarejestrowanych zamówień.</div>}
      {projects.slice(0, 4).map(p => (
        <div key={p.id} style={row}>
          <div><div style={{ fontSize: 12, fontWeight: 700 }}>{p.order_label}</div><div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{p.value ? `${fmt(p.value, 0)} ${p.currency || 'PLN'}` : '—'}</div></div>
          <span style={pill(C.blight, C.blue)}>{p.stage}</span>
        </div>
      ))}
    </div>
  )
}
