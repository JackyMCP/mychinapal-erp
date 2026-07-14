import { useEffect, useState } from 'react'

// Ekran powitalny pokazywany przy starcie aplikacji (szczególnie ważny przy
// otwieraniu jej jako zainstalowanej appki na telefonie) — logo MyChinaPal
// "pisze się" samo na białym tle, tak samo jak logo w Sidebarze, tylko
// większe i w wersji granatowej (czytelnej na jasnym tle).
const VISIBLE_MS = 1500
const FADE_MS = 450

export default function SplashScreen() {
  const [phase, setPhase] = useState('visible') // visible | fading | hidden

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), VISIBLE_MS)
    const t2 = setTimeout(() => setPhase('hidden'), VISIBLE_MS + FADE_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === 'fading' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
      pointerEvents: phase === 'fading' ? 'none' : 'auto',
    }}>
      <div className="splash-logo-wrap" style={{ position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
        <img src="/logo-navy.png" alt="MyChinaPal" className="splash-logo-img" style={{ height: 56, width: 'auto', display: 'block' }} />
        <div className="splash-logo-cursor" />
      </div>
      <style>{`
        @keyframes splashTypeReveal { 0% { clip-path: inset(0 100% 0 0); } 55% { clip-path: inset(0 0% 0 0); } 100% { clip-path: inset(0 0% 0 0); } }
        @keyframes splashCursorMove { 0% { left: 0%; opacity: 1; } 55% { left: 100%; opacity: 1; } 62% { opacity: 0; } 100% { opacity: 0; } }
        .splash-logo-img { animation: splashTypeReveal 1.3s cubic-bezier(.4,0,.2,1) forwards; }
        .splash-logo-cursor {
          position: absolute; top: 2px; bottom: 2px; width: 3px; border-radius: 3px;
          background: linear-gradient(180deg, #3B82F6, #0A1628);
          box-shadow: 0 0 10px rgba(37,99,235,.6);
          animation: splashCursorMove 1.3s cubic-bezier(.4,0,.2,1) forwards;
        }
      `}</style>
    </div>
  )
}
