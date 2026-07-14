import { C } from '../lib/theme'

// Wspólny placeholder dla zakładek, które dla chińskiej spółki (albo faktur
// wspólnych) jeszcze nie mają gotowego zestawienia — np. bo zależą od ustalenia
// statusu podatnika VAT, albo dotyczą wyłącznie polskich formalności (KSeF, JPK).
export default function ComingSoonCN({ label, note }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🚧</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{label} — chińska spółka</div>
      <div style={{ fontSize: 11.5, maxWidth: 380, margin: '0 auto' }}>
        {note || 'Ta zakładka pojawi się w kolejnym kroku, razem z ustaleniem statusu podatnika VAT (mały / ogólny podatnik) chińskiej spółki — to od niego zależy sposób liczenia tych zestawień.'}
      </div>
    </div>
  )
}
