import { useLang } from "../../lib/i18n/LanguageContext";
import { avatarColor, initials } from '../klienci/utils'
import { C } from '../../lib/theme'

export default function WhoAmI({ profile, isZarzad }) {
  const {
    t
  } = useLang();

  if (!profile) return null
  const firstName = (profile.full_name || '').trim().split(/\s+/)[0] || ''
  return (
    <div className="ux-fade-in" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(profile.full_name) }}>{initials(profile.full_name)}</div>
      <div style={{ flex: 1 }}>
        <div className="whoami-greeting" style={{ fontFamily: "'Syne',sans-serif", fontSize: 27, fontWeight: 800, color: C.navy, display: 'flex', alignItems: 'center', gap: 9, lineHeight: 1.15 }}>
          {t("Witaj")}, {firstName}! <span style={{ fontSize: 24 }}>👋</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontWeight: 600 }}>{t("w panelu sterowania firmy MyChinaPal")}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 11px', borderRadius: 20, background: isZarzad ? C.plight : C.blight, color: isZarzad ? C.purple : C.blue, flexShrink: 0 }}>
        {isZarzad ? t("Zarząd") : t("Pracownik")}
      </span>
      <style>{`
        @keyframes whoamiBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .whoami-greeting { transform-origin: left center; animation: whoamiBreathe 3.6s ease-in-out infinite; display: inline-flex; }
      `}</style>
    </div>
  );
}
