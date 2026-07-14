import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../lib/i18n/LanguageContext'
import CountUp from '../ui/CountUp'

const HITS_NEEDED = 3
const REVEAL_SECONDS = 20

// Kafelek "Wpływy" na Dashboardzie — złota ruda na wadze, którą trzeba rozbić
// (3 uderzenia), żeby zobaczyć kwotę. Po odsłonięciu kwota chowa się z powrotem
// po 20 sekundach i rudę trzeba rozkuć na nowo.
export default function GoldOreReveal({ value, label }) {
  const { t } = useLang()
  const [hits, setHits] = useState(0)
  const [shattering, setShattering] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [barKey, setBarKey] = useState(0)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (!revealed) return
    timeoutRef.current = setTimeout(() => {
      setRevealed(false)
      setHits(0)
      setShattering(false)
    }, REVEAL_SECONDS * 1000)
    return () => clearTimeout(timeoutRef.current)
  }, [revealed])

  const handleHit = () => {
    if (revealed || shattering) return
    const next = hits + 1
    if (next >= HITS_NEEDED) {
      setShattering(true)
      setTimeout(() => {
        setRevealed(true)
        setBarKey(k => k + 1)
      }, 480)
    } else {
      setHits(next)
      setShakeKey(k => k + 1)
    }
  }

  return (
    <div style={{ background: 'linear-gradient(145deg, #0f1a3d, #0a1330)', borderRadius: 9, padding: '12px 14px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 92 }}>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>{label}</div>

      {revealed ? (
        <>
          <div className="gold-amount-in" style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, marginTop: 2, background: 'linear-gradient(90deg,#FFD700,#FFF3B0,#FFD700)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: '0 0 18px rgba(255,215,0,.35)' }}>
            <CountUp value={Math.round(value)} /> {t("PLN")}
          </div>
          <div key={barKey} className="gold-timer-bar-track">
            <div className="gold-timer-bar-fill" />
          </div>
        </>
      ) : (
        <div onClick={handleHit} title={t('Kliknij, aby rozkuć rudę')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: shattering ? 'default' : 'pointer', marginTop: 4, userSelect: 'none' }}>
          <div className="ore-scale-wrap">
            <svg width="30" height="20" viewBox="0 0 30 20" style={{ display: 'block', margin: '0 auto' }}>
              <line x1="15" y1="0" x2="15" y2="14" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" />
              <line x1="3" y1="14" x2="27" y2="14" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" />
              <line x1="3" y1="14" x2="3" y2="18" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" />
              <line x1="27" y1="14" x2="27" y2="18" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" />
              <line x1="0" y1="18" x2="30" y2="18" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" />
            </svg>
            <div key={shakeKey} className={`ore-rock${shattering ? ' ore-shattering' : ''}${!shattering && hits > 0 ? ' ore-shake' : ''}`}>
              <svg width="58" height="52" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="rockGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7a6a5b" />
                    <stop offset="100%" stopColor="#48392c" />
                  </linearGradient>
                </defs>
                <polygon points="20,80 8,48 24,18 55,8 88,24 92,60 70,92 38,96" fill="url(#rockGrad)" stroke="#2c2018" strokeWidth="2.5" />
                <polygon points="30,42 46,30 57,47 42,58" fill="#FFD700" opacity="0.9" />
                <polygon points="55,60 71,54 77,71 60,77" fill="#FFC300" opacity="0.8" />
                <polygon points="34,66 46,60 51,73" fill="#FFEB80" opacity="0.7" />
                {hits >= 1 && <path d="M 20 40 L 35 55 L 30 70" stroke="#1c140d" strokeWidth="2.4" fill="none" strokeLinecap="round" className="ore-crack" />}
                {hits >= 2 && <path d="M 70 30 L 60 45 L 68 62" stroke="#1c140d" strokeWidth="2.4" fill="none" strokeLinecap="round" className="ore-crack" />}
              </svg>
              {[...Array(6)].map((_, i) => shattering && (
                <span key={i} className={`ore-shard ore-shard-${i}`}>✦</span>
              ))}
              {[...Array(5)].map((_, i) => shattering && (
                <span key={`spark-${i}`} className={`ore-spark ore-spark-${i}`}>✨</span>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.3 }}>
            🔨 {t('Kliknij')} {HITS_NEEDED - hits}× {t('aby rozkuć złoto')}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ore-shake-kf { 0%,100% { transform: rotate(0deg) translateX(0); } 20% { transform: rotate(-6deg) translateX(-2px); } 40% { transform: rotate(5deg) translateX(2px); } 60% { transform: rotate(-3deg); } 80% { transform: rotate(2deg); } }
        .ore-rock { position: relative; display: inline-block; }
        .ore-shake { animation: ore-shake-kf .35s ease; }
        .ore-crack { opacity: 0; animation: ore-crack-in .25s ease forwards; }
        @keyframes ore-crack-in { from { opacity: 0; } to { opacity: 1; } }
        .ore-shattering svg { animation: ore-pop .45s ease forwards; }
        @keyframes ore-pop { 0% { transform: scale(1); opacity: 1; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1.3); opacity: 0; } }
        .ore-shard { position: absolute; top: 45%; left: 45%; color: #FFD700; font-size: 14px; opacity: 0; text-shadow: 0 0 6px rgba(255,215,0,.8); }
        .ore-shard-0 { animation: shard-fly-0 .6s ease forwards; }
        .ore-shard-1 { animation: shard-fly-1 .6s ease forwards; }
        .ore-shard-2 { animation: shard-fly-2 .6s ease forwards; }
        .ore-shard-3 { animation: shard-fly-3 .6s ease forwards; }
        .ore-shard-4 { animation: shard-fly-4 .6s ease forwards; }
        .ore-shard-5 { animation: shard-fly-5 .6s ease forwards; }
        @keyframes shard-fly-0 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(-38px,-28px) scale(0.4) rotate(-90deg); } }
        @keyframes shard-fly-1 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(36px,-30px) scale(0.4) rotate(80deg); } }
        @keyframes shard-fly-2 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(-42px,18px) scale(0.4) rotate(60deg); } }
        @keyframes shard-fly-3 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(40px,22px) scale(0.4) rotate(-70deg); } }
        @keyframes shard-fly-4 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(4px,-42px) scale(0.4) rotate(45deg); } }
        @keyframes shard-fly-5 { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); } 100% { opacity: 0; transform: translate(-6px,40px) scale(0.4) rotate(-45deg); } }
        .ore-spark { position: absolute; top: 40%; left: 50%; font-size: 11px; opacity: 0; }
        .ore-spark-0 { animation: spark-fly-0 .55s ease-out forwards; }
        .ore-spark-1 { animation: spark-fly-1 .55s ease-out forwards .05s; }
        .ore-spark-2 { animation: spark-fly-2 .55s ease-out forwards .1s; }
        .ore-spark-3 { animation: spark-fly-3 .55s ease-out forwards .03s; }
        .ore-spark-4 { animation: spark-fly-4 .55s ease-out forwards .08s; }
        @keyframes spark-fly-0 { 0% { opacity: 1; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(-24px,-38px) scale(1.1); } }
        @keyframes spark-fly-1 { 0% { opacity: 1; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(22px,-40px) scale(1.1); } }
        @keyframes spark-fly-2 { 0% { opacity: 1; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(-14px,26px) scale(1.1); } }
        @keyframes spark-fly-3 { 0% { opacity: 1; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(18px,20px) scale(1.1); } }
        @keyframes spark-fly-4 { 0% { opacity: 1; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(2px,-36px) scale(1.1); } }
        .gold-amount-in { animation: gold-fade-in .4s ease; }
        @keyframes gold-fade-in { from { opacity: 0; transform: translateY(4px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .gold-timer-bar-track { margin-top: 7px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
        .gold-timer-bar-fill { height: 100%; background: linear-gradient(90deg,#FFD700,#FFC300); width: 100%; animation: gold-timer-drain ${REVEAL_SECONDS}s linear forwards; }
        @keyframes gold-timer-drain { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  )
}
