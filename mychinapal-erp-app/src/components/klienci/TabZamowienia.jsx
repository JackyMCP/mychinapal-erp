import { useLang } from "../../lib/i18n/LanguageContext";
import { C, fmt } from '../../lib/theme'

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })

const STAGE_COLORS = {
  'Zamówienie złożone': [C.blight, C.blue],
  'Produkcja': [C.olight, C.orange],
  'Transport': [C.glight, C.green],
  'Odprawa celna': [C.rlight, C.red],
  'Dostarczone': [C.glight, C.green],
}

export default function TabZamowienia({ projects }) {
  const {
    t
  } = useLang();

  if (projects.length === 0) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ten klient nie ma jeszcze zarejestrowanych zamówień.")}</div>;
  return (
    <div>
      {projects.map(p => {
        const [bg, fg] = STAGE_COLORS[p.stage] || [C.bg, C.muted]
        return (
          <div key={p.id} style={row}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.order_label}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{t("utworzono")} {p.created_at ? new Date(p.created_at).toLocaleDateString('pl-PL') : '—'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800 }}>{p.value ? `${fmt(p.value, 0)} ${p.currency || 'PLN'}` : '—'}</div>
              <span style={pill(bg, fg)}>{p.stage}</span>
              {!p.active && <span style={pill(C.bg, C.muted)}>{t("nieaktywne")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
