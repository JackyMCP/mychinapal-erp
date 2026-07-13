import { useLang } from "../../lib/i18n/LanguageContext";
import { useNavigate } from 'react-router-dom'
import { C, fmt } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

const STAGE_COLORS = [C.blue, C.orange, C.purple, C.teal || '#0891B2', C.green]

export default function MyProjects({ projects, clientNameById, stageByProject = {} }) {
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
      {projects.map((p, idx) => {
        const stage = stageByProject[p.id]
        const stageColor = STAGE_COLORS[idx % STAGE_COLORS.length]
        return (
          <div key={p.id} className="myproj-row" onClick={() => navigate(`/projekty?project=${p.id}`)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 6px', borderRadius: 9, borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background .15s ease, transform .15s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(clientNameById[p.client_id] || '') }}>{initials(clientNameById[p.client_id] || '?')}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.order_label}</div>
                <div style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientNameById[p.client_id] || t("Nieznany klient")}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {stage && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', background: stageColor + '1A', color: stageColor }}>
                  {stage.label}
                </span>
              )}
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 800 }}>{p.value != null ? `${fmt(p.value, 0)} PLN` : '—'}</div>
              <span className="myproj-chev" style={{ color: C.muted, fontSize: 13, transition: 'transform .15s ease' }}>›</span>
            </div>
          </div>
        );
      })}
      {projects.length > 0 && (
        <a onClick={() => navigate('/moje-projekty')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginTop: 10 }}>
          {t("Zobacz więcej")} →
        </a>
      )}
      <style>{`
        .myproj-row:hover { background: ${C.bg}; padding-left: 10px; }
        .myproj-row:hover .myproj-chev { transform: translateX(3px); color: ${C.blue}; }
      `}</style>
    </div>
  );
}
