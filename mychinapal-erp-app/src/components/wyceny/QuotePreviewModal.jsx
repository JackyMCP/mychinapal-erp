import { useLang } from "../../lib/i18n/LanguageContext";
import { C, fmt } from '../../lib/theme'

const cell = { padding: '7px 9px', fontSize: 11.5, borderBottom: `1px solid ${C.border}` }

// Szybki, tylko-do-odczytu podgląd pozycji wgranego wcześniej pliku wyceny —
// nic tu się nie da edytować ani zapisać, to tylko wgląd w zawartość Excela
// bez pobierania go na dysk (patrz previewQuoteFile w lib/quoteIntake.js).
export default function QuotePreviewModal({ title, fileName, side, rows, total, loading, error, onDownload, onClose }) {
  const { t } = useLang()
  const currency = side === 'cn' ? 'CNY' : 'PLN'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 720, maxWidth: '96vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{t(title)}</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {fileName}</div>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 15, color: C.muted, flexShrink: 0 }}>✕</span>
        </div>

        {loading && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: C.muted }}>{t("Wczytywanie pliku…")}</div>}
        {!loading && error && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: C.red }}>{error}</div>}
        {!loading && !error && (
          <>
            <div style={{ overflowY: 'auto', flex: 1, marginTop: 10, marginRight: -6, paddingRight: 6, border: `1px solid ${C.border}`, borderRadius: 9 }}>
              {rows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 11.5, color: C.muted }}>{t("Nie rozpoznano żadnych pozycji w tym pliku — pobierz go, żeby zobaczyć zawartość.")}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg, position: 'sticky', top: 0 }}>
                      <th style={{ ...cell, textAlign: 'left', fontWeight: 700, color: C.muted, fontSize: 10 }}>{t("Nazwa")}</th>
                      <th style={{ ...cell, textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 10 }}>{t("Ilość")}</th>
                      <th style={{ ...cell, textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 10 }}>{t("Cena jedn.")}</th>
                      <th style={{ ...cell, textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 10 }}>{t("Wartość")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={cell}>
                          <div style={{ fontWeight: 600 }}>{r.name || '—'}</div>
                          {r.specification && <div style={{ fontSize: 10, color: C.muted, marginTop: 1, whiteSpace: 'pre-wrap' }}>{r.specification}</div>}
                        </td>
                        <td style={{ ...cell, textAlign: 'right' }}>{r.qty} {r.unit || ''}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmt(r.unit_price_cny, 2)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt((Number(r.qty) || 0) * (Number(r.unit_price_cny) || 0), 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.muted }}>{rows.length} {t("pozycji")}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800 }}>{fmt(total, 2)} {currency}</div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onDownload} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("⬇ Pobierz plik")}</button>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t("Zamknij")}</button>
        </div>
      </div>
    </div>
  )
}
