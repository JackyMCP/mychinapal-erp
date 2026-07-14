import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../lib/i18n/LanguageContext'
import CountUp from '../ui/CountUp'

const REVEAL_SECONDS = 20

// Kafelek "Wypływy" na Dashboardzie — kliknięcie monety odpala animację wrzucenia
// jej do worka, co odsłania całą kwotę. Po 20 sekundach kwota chowa się z powrotem
// i trzeba kliknąć monetę jeszcze raz.
export default function CoinSackReveal({ value, label }) {
  const { t } = useLang()
  const [tossing, setTossing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [bounceKey, setBounceKey] = useState(0)
  const [barKey, setBarKey] = useState(0)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (!revealed) return
    timeoutRef.current = setTimeout(() => {
      setRevealed(false)
      setTossing(false)
    }, REVEAL_SECONDS * 1000)
    return () => clearTimeout(timeoutRef.current)
  }, [revealed])

  const handleToss = () => {
    if (tossing || revealed) return
    setTossing(true)
    setTimeout(() => {
      setRevealed(true)
      setBounceKey(k => k + 1)
      setBarKey(k => k + 1)
    }, 620)
  }

  return (
    <div style={{ background: 'linear-gradient(145deg, #2a2140, #1a1530)', borderRadius: 9, padding: '12px 14px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 92 }}>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>{label}</div>

      {revealed ? (
        <>
          <div className="coin-amount-in" style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, marginTop: 2 }}>
            <CountUp value={Math.round(value)} /> {t("PLN")}
          </div>
          <div key={barKey} className="coin-timer-bar-track">
            <div className="coin-timer-bar-fill" />
          </div>
        </>
      ) : (
        <div onClick={handleToss} title={t('Kliknij monetę, aby wrzucić ją do worka')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: tossing ? 'default' : 'pointer', marginTop: 4, userSelect: 'none' }}>
          <div className="sack-wrap">
            {!tossing && <div className="sack-coin">🪙</div>}
            {tossing && <div key={bounceKey} className="sack-coin sack-coin-toss">🪙</div>}
            <div className={`sack-bag${tossing ? ' sack-bounce' : ''}`}>
              <svg width="46" height="42" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="sackGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8a6a45" />
                    <stop offset="100%" stopColor="#5c4529" />
                  </linearGradient>
                </defs>
                <path d="M 30 20 Q 50 5 70 20 L 82 55 Q 85 92 50 96 Q 15 92 18 55 Z" fill="url(#sackGrad)" stroke="#3a2a18" strokeWidth="2.5" />
                <path d="M 30 20 Q 50 30 70 20" fill="none" stroke="#3a2a18" strokeWidth="2.5" />
                <ellipse cx="50" cy="19" rx="6" ry="4" fill="#3a2a18" />
                <path d="M 26 55 Q 50 65 74 55" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
              </svg>
              {tossing && <span className="sack-dust">💨</span>}
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.3 }}>
            🪙 {t('Kliknij monetę, aby wrzucić do worka')}
          </div>
        </div>
      )}

      <style>{`
        .sack-wrap { position: relative; width: 46px; height: 62px; flex-shrink: 0; }
        .sack-coin { position: absolute; left: 10px; top: 0; font-size: 20px; z-index: 2; }
        .sack-coin-toss { animation: coin-toss-kf .55s cubic-bezier(.55,0,.85,.35) forwards; }
        @keyframes coin-toss-kf {
          0%   { left: 10px; top: 0px; transform: rotate(0deg) scale(1); opacity: 1; }
          55%  { left: 16px; top: 20px; transform: rotate(280deg) scale(.9); opacity: 1; }
          85%  { left: 14px; top: 32px; transform: rotate(480deg) scale(.55); opacity: 1; }
          100% { left: 14px; top: 34px; transform: rotate(560deg) scale(.2); opacity: 0; }
        }
        .sack-bag { position: absolute; left: 0; top: 20px; }
        .sack-bounce { animation: sack-bounce-kf .4s ease .5s; }
        @keyframes sack-bounce-kf { 0% { transform: scale(1); } 40% { transform: scale(1.08,.94); } 70% { transform: scale(.96,1.05); } 100% { transform: scale(1); } }
        .sack-dust { position: absolute; left: 6px; top: 30px; font-size: 13px; opacity: 0; animation: dust-kf .5s ease .55s forwards; }
        @keyframes dust-kf { 0% { opacity: .9; transform: translateY(0) scale(.7); } 100% { opacity: 0; transform: translateY(-16px) scale(1.3); } }
        .coin-amount-in { animation: coin-fade-in .4s ease; }
        @keyframes coin-fade-in { from { opacity: 0; transform: translateY(4px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .coin-timer-bar-track { margin-top: 7px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
        .coin-timer-bar-fill { height: 100%; background: linear-gradient(90deg,#c9a3ff,#8a6bd8); width: 100%; animation: coin-timer-drain ${REVEAL_SECONDS}s linear forwards; }
        @keyframes coin-timer-drain { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  )
}
