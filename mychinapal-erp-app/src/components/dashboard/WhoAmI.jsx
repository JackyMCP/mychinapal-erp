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
    <div className="ux-fade-in whoami-card" style={{ position: 'relative', background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '26px 28px', display: 'flex', alignItems: 'center', gap: 20, overflow: 'hidden' }}>
      <div className="whoami-glow" />
      <div style={{ width: 60, height: 60, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(profile.full_name), position: 'relative', zIndex: 1, boxShadow: `0 6px 18px ${isZarzad ? 'rgba(124,58,237,0.35)' : 'rgba(37,99,235,0.35)'}` }}>{initials(profile.full_name)}</div>
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <div className="whoami-greeting">
          <span className="whoami-greeting-text">{t("Witaj")}, {firstName}!</span> <span className="whoami-wave">👋</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 700, letterSpacing: 0.2, position: 'relative', zIndex: 1 }}>{t("w panelu sterowania firmy MyChinaPal")}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 11px', borderRadius: 20, background: isZarzad ? C.plight : C.blight, color: isZarzad ? C.purple : C.blue, flexShrink: 0, position: 'relative', zIndex: 1 }}>
        {isZarzad ? t("Zarząd") : t("Pracownik")}
      </span>
      <style>{`
        .whoami-card { box-shadow: 0 2px 14px rgba(10,22,40,0.05); }
        .whoami-glow {
          position: absolute;
          top: 50%;
          left: 90px;
          width: 420px;
          height: 420px;
          transform: translateY(-50%);
          background: radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(124,58,237,0.10) 45%, rgba(255,255,255,0) 72%);
          pointer-events: none;
          z-index: 0;
          animation: whoamiGlowPulse 3.6s ease-in-out infinite;
        }
        @keyframes whoamiGlowPulse {
          0%, 100% { opacity: 0.7; transform: translateY(-50%) scale(1); }
          50% { opacity: 1; transform: translateY(-50%) scale(1.12); }
        }
        .whoami-greeting {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: 'Syne', sans-serif;
          font-size: 42px;
          font-weight: 800;
          line-height: 1.1;
          transform-origin: left center;
          animation: whoamiBreathe 3.6s ease-in-out infinite;
        }
        .whoami-greeting-text {
          background: linear-gradient(100deg, ${C.navy} 0%, ${C.blue} 45%, ${C.purple} 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 0 rgba(37,99,235,0));
          animation: whoamiShine 5s ease-in-out infinite, whoamiTextGlow 3.6s ease-in-out infinite;
        }
        @keyframes whoamiShine {
          0% { background-position: 0% center; }
          50% { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
        @keyframes whoamiTextGlow {
          0%, 100% { filter: drop-shadow(0 0 0px rgba(37,99,235,0.0)); }
          50% { filter: drop-shadow(0 2px 14px rgba(37,99,235,0.35)); }
        }
        @keyframes whoamiBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .whoami-wave { font-size: 38px; display: inline-block; animation: whoamiWave 2.4s ease-in-out infinite; transform-origin: 70% 70%; }
        @keyframes whoamiWave {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(16deg); }
          20% { transform: rotate(-8deg); }
          30% { transform: rotate(16deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
