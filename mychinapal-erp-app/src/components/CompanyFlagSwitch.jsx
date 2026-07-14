import { C } from '../lib/theme'

// Przełącznik spółki (Polska / Chińska, opcjonalnie też "wspólne") — flagi z
// delikatną animacją falowania i poświaty. Używany w nagłówkach Kasa & Bank,
// Magazyn i Faktury (tam z trzecią, "połówkową" opcją dla faktur wspólnych).
//
// value: 'PL' | 'CN' | 'SHARED'
// onChange(next)
// variant: '2way' (PL/CN) albo '3way' (PL / SHARED / CN) — Faktury używają 3way.
export default function CompanyFlagSwitch({ value, onChange, variant = '2way', size = 'md' }) {
  const dim = size === 'sm' ? 30 : 36
  const fontSize = size === 'sm' ? 16 : 19

  const HalfFlag = ({ active }) => (
    <svg width={dim} height={dim * 0.72} viewBox="0 0 36 26" style={{ borderRadius: 5, display: 'block' }}>
      <rect x="0" y="0" width="18" height="13" fill="#fff" />
      <rect x="0" y="13" width="18" height="13" fill="#DC143C" />
      <rect x="18" y="0" width="18" height="26" fill="#DE2910" />
      <path d="M24.5 5.2 L25.6 8.4 L29 8.4 L26.3 10.3 L27.3 13.5 L24.5 11.5 L21.7 13.5 L22.7 10.3 L20 8.4 L23.4 8.4 Z" fill="#FFDE00" />
      <rect x="0" y="0" width="36" height="26" fill="none" stroke={active ? C.blue : 'rgba(0,0,0,.12)'} strokeWidth={active ? 2 : 1} rx="5" />
    </svg>
  )

  const items = variant === '3way'
    ? [
        { k: 'PL', label: 'Polska', node: <span style={{ fontSize }}>🇵🇱</span> },
        { k: 'SHARED', label: 'Wspólne PL+CN', node: <HalfFlag active={value === 'SHARED'} /> },
        { k: 'CN', label: 'Chińska', node: <span style={{ fontSize }}>🇨🇳</span> },
      ]
    : [
        { k: 'PL', label: 'Polska', node: <span style={{ fontSize }}>🇵🇱</span> },
        { k: 'CN', label: 'Chińska', node: <span style={{ fontSize }}>🇨🇳</span> },
      ]

  return (
    <div className="company-flag-switch" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}` }}>
      {items.map(it => (
        <div key={it.k} onClick={() => onChange(it.k)} title={it.label}
          className={value === it.k ? 'cfs-flag cfs-flag-active' : 'cfs-flag'}
          style={{
            width: dim, height: dim, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', background: value === it.k ? C.white : 'transparent',
            boxShadow: value === it.k ? '0 3px 10px rgba(37,99,235,.18)' : 'none',
            border: value === it.k ? `1.5px solid ${C.blue}` : '1.5px solid transparent',
            transition: 'all .15s ease',
          }}>
          {it.node}
        </div>
      ))}
      <style>{`
        .cfs-flag { animation: cfsIdle 5s ease-in-out infinite; }
        .cfs-flag:nth-child(2) { animation-delay: .6s; }
        .cfs-flag:nth-child(3) { animation-delay: 1.2s; }
        .cfs-flag-active { animation: cfsWave 2.6s ease-in-out infinite, cfsGlow 2.6s ease-in-out infinite; }
        @keyframes cfsIdle { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-1px) rotate(-2deg); } }
        @keyframes cfsWave {
          0%, 100% { transform: rotate(0deg) scale(1); }
          20% { transform: rotate(-6deg) scale(1.05); }
          40% { transform: rotate(4deg) scale(1.05); }
          60% { transform: rotate(-3deg) scale(1.03); }
          80% { transform: rotate(2deg) scale(1.02); }
        }
        @keyframes cfsGlow {
          0%, 100% { box-shadow: 0 3px 10px rgba(37,99,235,.18); }
          50% { box-shadow: 0 4px 18px rgba(37,99,235,.4); }
        }
      `}</style>
    </div>
  )
}
