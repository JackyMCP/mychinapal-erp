import { useLang } from "../../lib/i18n/LanguageContext";
import { useNavigate } from 'react-router-dom'
import { C, fmt } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

export default function MyProjects({ projects, clientNameById }) {
  const {
    t
  } = useLang();

  const navigate = useNavigate()
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>{t("Moje aktywne projekty")} <span style={{ color: C.text2 }}>({projects.length})</span></div>
      {projects.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t(
        "Nie masz jeszcze przypisanych projektów — przypisz się w widoku danego zamówienia (sekcja \"Zespół\")."
      )}</div>}
      {projects.map(p => (
        <div key={p.id} onClick={() => navigate(`/projekty?project=${p.id}`)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', background: avatarColor(clientNameById[p.client_id] || '') }}>{initials(clientNameById[p.client_id] || '?')}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p.order_label}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{clientNameById[p.client_id] || t("Nieznany klient")}</div>
            </div>
          </div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 800 }}>{p.value != null ? `${fmt(p.value, 0)} PLN` : '—'}</div>
        </div>
      ))}
    </div>
  );
}
