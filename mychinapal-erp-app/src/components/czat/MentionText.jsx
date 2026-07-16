import { splitMentions } from '../../lib/mentions'
import { C } from '../../lib/theme'

// Renderuje treść wiadomości czatu, wyróżniając kolorem/tłem każde
// "@Imię Nazwisko" rozpoznane jako wzmianka istniejącego użytkownika.
export default function MentionText({ text, profiles, mine }) {
  const parts = splitMentions(text, profiles)
  return parts.map((p, i) => p.type === 'mention'
    ? (
      <span key={i} style={{
        fontWeight: 800, color: mine ? '#fff' : C.blue,
        background: mine ? 'rgba(255,255,255,.22)' : C.blight,
        borderRadius: 5, padding: '0 4px',
      }}>{p.value}</span>
    )
    : <span key={i}>{p.value}</span>)
}
