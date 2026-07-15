import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'
import { isImageFile } from '../../lib/files'

// Popup pokazywany OD RAZU po przeciągnięciu (albo wybraniu) pliku do wysłania
// na czacie — pozwala natychmiast wybrać kategorię dokumentu (PI, CI, SAD itd.)
// albo jednym kliknięciem pominąć kategoryzację ("Brak kategoryzacji" -> 'Inne').
export default function AttachCategoryModal({ file, categories, onConfirm, onCancel }) {
  const { t } = useLang()
  const [category, setCategory] = useState(categories[0])
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (file && isImageFile(file.name)) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
  }, [file])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div style={{ background: C.white, borderRadius: 12, padding: 22, width: 420, maxWidth: '92vw', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{t("Kategoria dokumentu")}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg, borderRadius: 9, padding: '9px 12px', marginBottom: 16 }}>
          {previewUrl && isImageFile(file?.name)
            ? <img src={previewUrl} alt={file.name} style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ fontSize: 20, flexShrink: 0 }}>📎</span>}
          <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file?.name}</span>
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: C.text }}>{t("Co to za dokument?")}</label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, width: '100%', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}>
          {categories.map(c => <option key={c} value={c}>{t(c)}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={onCancel} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 }}>
            {t("Anuluj")}
          </button>
          <button onClick={() => onConfirm('Inne')} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.bg, color: C.text2 }}>
            {t("Brak kategoryzacji")}
          </button>
          <button onClick={() => onConfirm(category)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff' }}>
            {t("Zapisz kategorię")}
          </button>
        </div>
      </div>
    </div>
  );
}
