import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C } from '../../lib/theme'
import { toNum } from './calc'

// Lekkie okienko weryfikacji WARTOŚCI wyceny — zastępuje dawny pełny ekran
// podglądu pozycji/zdjęć. Wgrany plik NIE jest już rozbijany na pozycje —
// jeśli to Excel, próbujemy automatycznie zsumować ilość×cena (patrz
// detectQuoteValue w lib/quoteIntake.js); tak czy inaczej użytkownik
// zawsze widzi jedno pole z sumą do potwierdzenia/poprawienia przed zapisem.
export default function QuoteValueModal({ file, side, detectedValue, itemCount, onConfirm, onCancel, saving }) {
  const { t } = useLang()
  const [value, setValue] = useState(detectedValue != null ? String(detectedValue) : '')
  const currency = side === 'cn' ? 'CNY' : 'PLN'
  const label = side === 'cn' ? t('Wartość wyceny od zespołu CN') : t('Wartość wyceny dla klienta (z doliczoną marżą)')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div style={{ background: C.white, borderRadius: 14, padding: 22, width: 400, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14.5, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span>📄</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
          {detectedValue != null
            ? t(`Wykryto sumę z pliku (${itemCount} pozycji) — sprawdź i popraw, jeśli jest błędna.`)
            : t('Nie udało się automatycznie wykryć sumy z tego pliku — wpisz ją ręcznie.')}
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>{label}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
          <input type="text" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoFocus
            placeholder="0"
            style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{currency}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj")}</button>
          <button onClick={() => onConfirm(toNum(value))} disabled={saving || !String(value).trim()}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (saving || !String(value).trim()) ? .6 : 1 }}>
            {saving ? t("Zapisywanie…") : t("Zatwierdź i wyślij")}
          </button>
        </div>
      </div>
    </div>
  )
}
