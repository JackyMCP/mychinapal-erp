import { avatarColor, initials } from '../klienci/utils'

// Wspólny awatar używany na czatach (Czat Zarządu, czat klienta, czat
// zamówienia, kanał głosowy) — jeśli osoba ustawiła własne zdjęcie profilowe
// w Ustawieniach (profiles.avatar_url), pokazujemy je; w przeciwnym razie
// spada z powrotem do kółka z inicjałami w kolorze wygenerowanym z imienia
// (jak było wcześniej wszędzie).
export default function Avatar({ name, avatarUrl, size = 26, fontSize, style, boxShadow }) {
  const fs = fontSize || Math.round(size * 0.38)
  const common = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow, ...style,
  }
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || '?'} style={{ ...common, objectFit: 'cover' }} />
  }
  return (
    <div style={{ ...common, fontSize: fs, fontWeight: 800, color: '#fff', background: avatarColor(name || '') }}>
      {initials(name || '?')}
    </div>
  )
}
