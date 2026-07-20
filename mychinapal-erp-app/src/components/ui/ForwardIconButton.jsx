import { C } from '../../lib/theme'

// Wspólny, wyraźnie widoczny przycisk "Prześlij dalej" — używany wszędzie,
// gdzie da się coś przekazać dalej (wiadomości czatu, pliki, wyceny).
// Zgłoszenie: poprzednia wersja (sama szara strzałka ↪ w tekście) była za
// mało widoczna — teraz to zawsze kolorowe kółko z konturem, nie tylko przy
// najechaniu myszką (ważne też na telefonie, gdzie nie ma hover).
export default function ForwardIconButton({ onClick, title = 'Prześlij dalej', size = 24 }) {
  return (
    <span onClick={onClick} title={title}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.58), fontWeight: 700,
        background: C.blight, color: C.blue, border: `1.5px solid ${C.bmid}`,
        cursor: 'pointer', transition: 'all .12s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.blue; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = C.blue }}
      onMouseLeave={e => { e.currentTarget.style.background = C.blight; e.currentTarget.style.color = C.blue; e.currentTarget.style.borderColor = C.bmid }}
    >↪</span>
  )
}
