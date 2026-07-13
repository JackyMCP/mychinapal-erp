import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'

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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      display: 'flex', gap: 10, background: `linear-gradient(120deg, ${C.navy}, ${C.navy2})`,
      borderRadius: 12, padding: '10px 16px', marginBottom: 14,
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🇵🇱</span>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: '#93C5FD', letterSpacing: '.5px', lineHeight: 1.1 }}>{fmtIn('Europe/Warsaw', timeOpts, now)}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', textTransform: 'capitalize' }}>{t("Warszawa")} · {fmtIn('Europe/Warsaw', dateOpts, now)}</div>
        </div>
      </div>
      <div style={{ width: 1, background: 'rgba(255,255,255,.12)' }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🇨🇳</span>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: '#FCA5A5', letterSpacing: '.5px', lineHeight: 1.1 }}>{fmtIn('Asia/Shanghai', timeOpts, now)}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', textTransform: 'capitalize' }}>Shanghai · {fmtIn('Asia/Shanghai', dateOpts, now)}</div>
        </div>
      </div>
    </div>
  );
}
