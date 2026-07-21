import { C } from '../../lib/theme'

// Przycisk "Usuń wiadomość" — widoczny tylko przy własnych wiadomościach
// (sprawdzane przez wywołującego, patrz użycia w komponentach czatu).
// Usuwanie jest "miękkie": treść i załącznik znikają wszędzie, a w miejscu
// wiadomości zostaje neutralna notka "Wiadomość usunięta" (jak w WhatsApp).
export default function DeleteMessageButton({ onClick, title = 'Usuń wiadomość', size = 20 }) {
  return (
    <span onClick={onClick} title={title}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.52), fontWeight: 700,
        background: C.rlight || '#FEE2E2', color: C.red, border: `1.5px solid ${C.red}55`,
        cursor: 'pointer', transition: 'all .12s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.red; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = C.red }}
      onMouseLeave={e => { e.currentTarget.style.background = C.rlight || '#FEE2E2'; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red + '55' }}
    >🗑</span>
  )
}
