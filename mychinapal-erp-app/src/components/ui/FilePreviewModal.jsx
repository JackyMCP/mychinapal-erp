import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'
import { parseExcelGeneric, parseDocx } from '../../lib/genericFilePreview'

// Litera(y) kolumny Excela z numeru 1-indeksowanego (1->A, 27->AA...) — do
// nagłówka kolumn w podglądzie arkusza, dokładnie jak w prawdziwym Excelu.
function excelColLetter(n) {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Style pojedynczej komórki wyliczone przez genericFilePreview.js (kolor,
// pogrubienie, obramowanie, wyrównanie...) -> obiekt CSS dla <td>. Domyślna
// jasnoszara siatka, gdy plik nie definiuje własnego obramowania — dzięki
// temu arkusz zawsze wygląda jak "prawdziwy Excel", nawet dla pustych komórek.
function excelCellStyle(cell) {
  return {
    fontWeight: cell.bold ? 700 : 400,
    fontStyle: cell.italic ? 'italic' : 'normal',
    textDecoration: [cell.underline && 'underline', cell.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    fontSize: cell.size || 11,
    color: cell.color || '#1F2937',
    background: cell.bg || '#fff',
    textAlign: cell.align || 'left',
    verticalAlign: cell.valign === 'middle' ? 'middle' : cell.valign === 'top' ? 'top' : 'bottom',
    whiteSpace: cell.wrap ? 'normal' : 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderTop: cell.borderTop || '1px solid #E2E8F0',
    borderRight: cell.borderRight || '1px solid #E2E8F0',
    borderBottom: cell.borderBottom || '1px solid #E2E8F0',
    borderLeft: cell.borderLeft || '1px solid #E2E8F0',
    padding: '3px 7px',
    boxSizing: 'border-box',
  }
}

// Podgląd pliku W APLIKACJI zamiast wyskakującej nowej karty przeglądarki —
// obsługuje wszystkie najczęstsze formaty tak, żeby NIKT nie musiał pobierać
// pliku na dysk tylko po to, żeby zobaczyć co w nim jest (zgłoszenie
// użytkownika, wzorzec "jak na WhatsAppie"):
//  - obrazki -> <img>
//  - PDF -> natywna przeglądarka PDF w <iframe> (przeglądarka robi to sama)
//  - Excel (.xlsx/.xls/.xlsm/.csv) -> tabela (parsowana w locie przez `xlsx`)
//  - Word (.docx) -> renderowana treść (parsowana przez `mammoth`)
//  - tekst/.txt -> zwykły tekst
//  - reszta (stare .doc, .zip, itd.) -> ikona + Pobierz (nie da się pokazać
//    w przeglądarce bez natywnego wsparcia)
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const PDF_EXT = /\.pdf$/i
const EXCEL_EXT = /\.(xlsx|xls|xlsm|csv)$/i
const DOCX_EXT = /\.docx$/i
const DOC_LEGACY_EXT = /\.doc$/i
const TEXT_EXT = /\.(txt|log|md|json)$/i

function kindOf(fileName) {
  const n = fileName || ''
  if (IMG_EXT.test(n)) return 'image'
  if (PDF_EXT.test(n)) return 'pdf'
  if (EXCEL_EXT.test(n)) return 'excel'
  if (DOCX_EXT.test(n)) return 'docx'
  if (DOC_LEGACY_EXT.test(n)) return 'doc-legacy'
  if (TEXT_EXT.test(n)) return 'text'
  return 'other'
}

export default function FilePreviewModal({ url, fileName, onClose }) {
  const { t } = useLang()
  const kind = kindOf(fileName)
  const wide = kind === 'image' || kind === 'pdf' || kind === 'excel' || kind === 'docx'

  const [loading, setLoading] = useState(kind === 'excel' || kind === 'docx' || kind === 'text')
  const [error, setError] = useState(null)
  const [sheets, setSheets] = useState(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [docxHtml, setDocxHtml] = useState(null)
  const [textContent, setTextContent] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (kind !== 'excel' && kind !== 'docx' && kind !== 'text') return
      setLoading(true); setError(null)
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const blob = await resp.blob()
        if (kind === 'excel') {
          const parsed = await parseExcelGeneric(blob, fileName)
          if (!cancelled) { setSheets(parsed); setActiveSheet(0) }
        } else if (kind === 'docx') {
          const html = await parseDocx(blob)
          if (!cancelled) setDocxHtml(html)
        } else if (kind === 'text') {
          const text = await blob.text()
          if (!cancelled) setTextContent(text)
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [url, kind])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 18, width: wide ? '92vw' : 420, maxWidth: wide ? 1000 : '95vw', height: wide ? '88vh' : 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>📎 {fileName}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: C.muted, fontWeight: 700, fontSize: 13, flexShrink: 0, marginLeft: 12 }}>{t('✕ Zamknij')}</span>
        </div>

        {kind === 'excel' && sheets && sheets.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {sheets.map((s, i) => (
              <span key={i} onClick={() => setActiveSheet(i)} style={{
                fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                background: i === activeSheet ? C.blue : C.bg, color: i === activeSheet ? '#fff' : C.text2,
              }}>{s.name}</span>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: (kind === 'image') ? 'center' : 'stretch', justifyContent: (kind === 'image') ? 'center' : 'flex-start', background: C.bg, borderRadius: 10, minHeight: wide ? undefined : 160 }}>
          {kind === 'image' && (
            <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}

          {kind === 'pdf' && (
            <iframe src={url} title={fileName} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }} />
          )}

          {kind === 'excel' && (
            loading ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.muted, padding: 30 }}>{t('Wczytywanie arkusza…')}</div>
            ) : error ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.red, padding: 30, textAlign: 'center' }}>{t('Nie udało się wczytać podglądu: ')}{error}</div>
            ) : sheets && sheets[activeSheet] ? (
              <div style={{ width: '100%', overflow: 'auto', padding: 4, background: '#fff', borderRadius: 6 }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Calibri, Arial, sans-serif' }}>
                  <colgroup>
                    <col style={{ width: 42 }} />
                    {sheets[activeSheet].colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#E9EDF3', border: '1px solid #C7CFDB' }} />
                      {sheets[activeSheet].colWidths.map((_, i) => (
                        <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#E9EDF3', color: '#475569', fontSize: 10.5, fontWeight: 700, padding: '4px 6px', border: '1px solid #C7CFDB', whiteSpace: 'nowrap' }}>
                          {excelColLetter(i + 1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheets[activeSheet].rows.map((row, ri) => (
                      <tr key={ri} style={row.height ? { height: row.height } : undefined}>
                        <th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#E9EDF3', color: '#475569', fontSize: 10.5, fontWeight: 700, padding: '3px 6px', border: '1px solid #C7CFDB', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {ri + 1}
                        </th>
                        {row.cells.map((cell, ci) => (
                          <td key={ci} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={excelCellStyle(cell)}>
                            {cell.image ? (
                              <img src={cell.image} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 90, objectFit: 'contain', margin: '0 auto' }} />
                            ) : cell.value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheets[activeSheet].truncated && (
                  <div style={{ fontSize: 10.5, color: C.muted, padding: '8px 10px' }}>
                    {t(`Pokazano pierwsze ${sheets[activeSheet].rows.length} wierszy z ${sheets[activeSheet].totalRows} — pobierz plik, żeby zobaczyć całość.`)}
                  </div>
                )}
              </div>
            ) : null
          )}

          {kind === 'docx' && (
            loading ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.muted, padding: 30 }}>{t('Wczytywanie dokumentu…')}</div>
            ) : error ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.red, padding: 30, textAlign: 'center' }}>{t('Nie udało się wczytać podglądu: ')}{error}</div>
            ) : (
              <div style={{ width: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <div className="docx-preview" style={{ background: C.white, width: '100%', maxWidth: 780, padding: '36px 44px', borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,.06)', fontSize: 13, lineHeight: 1.6, color: C.text }}
                  dangerouslySetInnerHTML={{ __html: docxHtml || '' }} />
              </div>
            )
          )}

          {kind === 'text' && (
            loading ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.muted, padding: 30 }}>{t('Wczytywanie…')}</div>
            ) : error ? (
              <div style={{ margin: 'auto', fontSize: 12, color: C.red, padding: 30, textAlign: 'center' }}>{t('Nie udało się wczytać podglądu: ')}{error}</div>
            ) : (
              <pre style={{ width: '100%', margin: 0, padding: 16, fontSize: 11.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textContent}</pre>
            )
          )}

          {(kind === 'doc-legacy' || kind === 'other') && (
            <div style={{ margin: 'auto', textAlign: 'center', padding: 40, color: C.muted, fontSize: 12.5 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>📄</div>
              {kind === 'doc-legacy'
                ? t('Stary format .doc nie ma podglądu w aplikacji — pobierz plik, żeby zobaczyć zawartość.')
                : t('Brak podglądu dla tego typu pliku — pobierz go, żeby zobaczyć zawartość.')}
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
