import { useLang } from "../../lib/i18n/LanguageContext";
import { C } from '../../lib/theme'

// Podgląd pliku W APLIKACJI zamiast wyskakującej nowej karty przeglądarki
// (zgłoszenie: otwieranie w osobnej karcie/oknie systemowej przeglądarki
// wyrywa z aplikacji — lepiej pokazać na miejscu). Obrazki i PDF renderują
// się od razu; inne typy (Excel/Word/itd.) pokazują ikonę + nazwę pliku i
// przycisk Pobierz (bez automatycznego podglądu — przeglądarki tego nie
// potrafią natywnie wyświetlić).
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const PDF_EXT = /\.pdf$/i

export default function FilePreviewModal({ url, fileName, onClose }) {
  const { t } = useLang()
  const isImg = IMG_EXT.test(fileName || '')
  const isPdf = PDF_EXT.test(fileName || '')
  const wide = isImg || isPdf

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 18, width: wide ? '92vw' : 420, maxWidth: wide ? 900 : '95vw', height: wide ? '88vh' : 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>📎 {fileName}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: C.muted, fontWeight: 700, fontSize: 13, flexShrink: 0, marginLeft: 12 }}>{t('✕ Zamknij')}</span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, borderRadius: 10, minHeight: wide ? undefined : 160 }}>
          {isImg ? (
            <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : isPdf ? (
            <iframe src={url} title={fileName} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }} />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 12.5 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>📄</div>
              {t('Brak podglądu dla tego typu pliku — pobierz go, żeby zobaczyć zawartość.')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexShrink: 0 }}>
          <a href={url} download={fileName} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: C.blue, padding: '8px 16px', borderRadius: 8, textDecoration: 'none' }}>
            {t('⬇ Pobierz')}
          </a>
        </div>
      </div>
    </div>
  )
}
