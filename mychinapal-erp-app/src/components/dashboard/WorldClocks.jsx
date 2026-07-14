import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'
import useIsMobile from '../../lib/useIsMobile'

const timeOpts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
const dateOpts = { weekday: 'short', day: 'numeric', month: 'short' }

function fmtIn(tz, opts, now) {
  return new Intl.DateTimeFormat('pl-PL', { ...opts, timeZone: tz }).format(now)
}

// Kompaktowy pasek dwóch zegarów na żywo (Warszawa / Shanghai) — czysto estetyczny
// dodatek, nie zmienia niczego innego w układzie Dashboardu.
export default function WorldClocks() {
  const { t } = useLang()
  const [now, setNow] = useState(new Date())
  const isMobile = useIsMobile()

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeSize = isMobile ? 15 : 22
  const iconSize = isMobile ? 14 : 18

  return (
    <div style={{
      display: 'flex', gap: isMobile ? 6 : 10, background: `linear-gradient(120deg, ${C.navy}, ${C.navy2})`,
      borderRadius: 12, padding: isMobile ? '8px 10px' : '10px 16px', marginBottom: 14, overflow: 'hidden',
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 6 : 10 }}>
        <span style={{ fontSize: iconSize, flexShrink: 0 }}>🇵🇱</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: timeSize, fontWeight: 800, color: '#93C5FD', letterSpacing: '.5px', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{fmtIn('Europe/Warsaw', timeOpts, now)}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Warszawa")} · {fmtIn('Europe/Warsaw', dateOpts, now)}</div>
        </div>
      </div>
      <div style={{ width: 1, background: 'rgba(255,255,255,.12)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 6 : 10 }}>
        <span style={{ fontSize: iconSize, flexShrink: 0 }}>🇨🇳</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: timeSize, fontWeight: 800, color: '#FCA5A5', letterSpacing: '.5px', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{fmtIn('Asia/Shanghai', timeOpts, now)}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Shanghai · {fmtIn('Asia/Shanghai', dateOpts, now)}</div>
        </div>
      </div>
    </div>
  );
}
