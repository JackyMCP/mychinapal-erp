import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C } from '../../lib/theme'

const field = { border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 7px', fontSize: 11, width: '100%', outline: 'none', boxSizing: 'border-box' }

// Ekran podglądu sparsowanych wierszy Excela PRZED wstawieniem ich do
// wyceny (i przed wgraniem zdjęć do Storage / wywołaniem AI dla kodu
// CN/HS/tłumaczenia — to wszystko dzieje się dopiero PO zatwierdzeniu tutaj).
// Parser dopasowuje kolumny "na wyczucie" i czasem się myli (zła kolumna,
// złe zdjęcie przypisane do wiersza) — ten ekran daje szansę złapać i
// poprawić/usunąć taki wiersz, zanim zniknie w pełnym formularzu pozycji
// wymieszany z resztą.
export default function ExcelImportPreview({ rows, fileName, onConfirm, onCancel }) {
  const { t } = useLang()
  const [localRows, setLocalRows] = useState(() => rows.map((r, i) => ({ ...r, _pKey: i })))
  // Zdjęcie przeciągane w danym momencie (skąd) — żeby drop na innej pozycji
  // wiedział, co i skąd przenieść. Parser dopasowuje zdjęcia do wierszy "na
  // wyczucie" wg pozycji w pliku Excel i czasem się myli o wiersz — to jedyny
  // w pełni niezawodny sposób, żeby dało się to poprawić ręcznie.
  const [dragSrc, setDragSrc] = useState(null) // { key, idx }

  const patchRow = (key, patch) => setLocalRows(prev => prev.map(r => r._pKey === key ? { ...r, ...patch } : r))
  const removeRow = (key) => setLocalRows(prev => prev.filter(r => r._pKey !== key))

  const movePhoto = (fromKey, idx, toKey) => {
    if (fromKey === toKey) return
    setLocalRows(prev => {
      const fromRow = prev.find(r => r._pKey === fromKey)
      const moved = fromRow?._photoDataUrls?.[idx]
      if (moved === undefined) return prev
      return prev.map(r => {
        if (r._pKey === fromKey) {
          const next = (r._photoDataUrls || []).slice()
          next.splice(idx, 1)
          return { ...r, _photoDataUrls: next }
        }
        if (r._pKey === toKey) {
          return { ...r, _photoDataUrls: [...(r._photoDataUrls || []), moved] }
        }
        return r
      })
    })
  }
  const removePhoto = (key, idx) => setLocalRows(prev => prev.map(r => (
    r._pKey === key ? { ...r, _photoDataUrls: (r._photoDataUrls || []).filter((_, i) => i !== idx) } : r
  )))
  const handleDropOnRow = (e, toKey) => {
    e.preventDefault()
    if (dragSrc) movePhoto(dragSrc.key, dragSrc.idx, toKey)
    setDragSrc(null)
  }

  const handleConfirm = () => {
    // _pKey był tylko pomocniczym kluczem do edycji na tym ekranie — usuwamy
    // go przed przekazaniem dalej, żeby nie mieszał się z resztą pól pozycji.
    onConfirm(localRows.map(({ _pKey, ...rest }) => rest))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div style={{ background: C.white, borderRadius: 14, padding: 20, width: 860, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{t("📋 Podgląd importu")}{fileName ? ` — ${fileName}` : ''}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {t("Sprawdź czy nazwy, zdjęcia, ilości i ceny są przypisane do właściwych wierszy — parser dopasowuje kolumny i zdjęcia automatycznie i czasem się myli. Popraw, usuń błędny wiersz albo anuluj cały import.")}
          </div>
          <div style={{ fontSize: 10.5, color: C.blue, marginTop: 4, fontWeight: 600 }}>
            {t("🖐 Przeciągnij zdjęcie na inną pozycję, żeby je tam przenieść — jeśli parser podpiął je do złego wiersza.")}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, marginTop: 12, marginRight: -6, paddingRight: 6 }}>
          {localRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12 }}>{t("Wszystkie wiersze zostały usunięte z podglądu — cofnij albo anuluj import.")}</div>
          )}
          {localRows.map((r) => (
            <div key={r._pKey}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDropOnRow(e, r._pKey)}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px', borderBottom: `1px solid ${C.border}`, background: dragSrc && dragSrc.key !== r._pKey ? C.blight : 'transparent', transition: 'background .1s ease' }}>
              <div style={{
                width: 96, minHeight: 46, flexShrink: 0, borderRadius: 8, background: C.bg,
                border: `1.5px dashed ${C.border}`, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4, padding: 4, boxSizing: 'border-box',
              }}>
                {(!r._photoDataUrls || r._photoDataUrls.length === 0) && (
                  <span style={{ fontSize: 16, opacity: .35, margin: 'auto' }}>📦</span>
                )}
                {(r._photoDataUrls || []).map((url, idx) => (
                  <div key={idx} draggable
                    onDragStart={() => setDragSrc({ key: r._pKey, idx })}
                    onDragEnd={() => setDragSrc(null)}
                    title={t('Przeciągnij, żeby przenieść na inną pozycję')}
                    style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, cursor: 'grab', flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    <span onClick={() => removePhoto(r._pKey, idx)} title={t('Usuń to zdjęcie')}
                      style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1, boxShadow: '0 0 0 1.5px #fff' }}>✕</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                <input style={field} value={r.name} onChange={e => patchRow(r._pKey, { name: e.target.value })} placeholder={t('Nazwa')} />
                <textarea style={{ ...field, marginTop: 5, resize: 'vertical', minHeight: 30, fontFamily: 'inherit' }} rows={2} value={r.specification} onChange={e => patchRow(r._pKey, { specification: e.target.value })} placeholder={t('Specyfikacja')} />
              </div>
              <div style={{ width: 70, flexShrink: 0 }}>
                <label style={{ fontSize: 9, color: C.muted, display: 'block', marginBottom: 2 }}>{t("Ilość")}</label>
                <input style={field} type="text" inputMode="decimal" value={r.qty} onChange={e => patchRow(r._pKey, { qty: e.target.value })} />
              </div>
              <div style={{ width: 90, flexShrink: 0 }}>
                <label style={{ fontSize: 9, color: C.muted, display: 'block', marginBottom: 2 }}>{t("Cena EXW (CNY)")}</label>
                <input style={field} type="text" inputMode="decimal" value={r.unit_price_cny} onChange={e => patchRow(r._pKey, { unit_price_cny: e.target.value })} />
              </div>
              <span onClick={() => removeRow(r._pKey)} title={t('Usuń ten wiersz z importu')}
                style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.red, background: C.rlight, border: `1px solid ${C.rmid}`, cursor: 'pointer', marginTop: 14 }}>🗑</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 10.5, color: C.muted }}>{t(`${localRows.length} z ${rows.length} pozycji zostanie zaimportowanych`)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj import")}</button>
            <button onClick={handleConfirm} disabled={!localRows.length}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: localRows.length ? 'pointer' : 'not-allowed', opacity: localRows.length ? 1 : .5 }}>
              {t(`✓ Zaimportuj ${localRows.length} ${localRows.length === 1 ? 'pozycję' : 'pozycji'}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
