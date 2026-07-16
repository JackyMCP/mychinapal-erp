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

  const patchRow = (key, patch) => setLocalRows(prev => prev.map(r => r._pKey === key ? { ...r, ...patch } : r))
  const removeRow = (key) => setLocalRows(prev => prev.filter(r => r._pKey !== key))

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
        </div>

        <div style={{ overflowY: 'auto', flex: 1, marginTop: 12, marginRight: -6, paddingRight: 6 }}>
          {localRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12 }}>{t("Wszystkie wiersze zostały usunięte z podglądu — cofnij albo anuluj import.")}</div>
          )}
          {localRows.map((r) => (
            <div key={r._pKey} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 8, flexShrink: 0, background: C.bg, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {r._photoDataUrls?.[0]
                  ? <img src={r._photoDataUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 16, opacity: .35 }}>📦</span>}
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
