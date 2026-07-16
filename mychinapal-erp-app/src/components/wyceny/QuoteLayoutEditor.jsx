import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import { PAGE_W, PAGE_H, FONT_OPTIONS, buildDefaultLayout, newElement } from './layoutDefaults'
import { generateQuotePdfFromLayout, resolveTemplateText, buildTemplateContext } from './pdfFromLayout'

const PX_PER_MM = 3
const CANVAS_W = PAGE_W * PX_PER_MM
const CANVAS_H = PAGE_H * PX_PER_MM

const cssFont = (family) => {
  if (family === 'helvetica') return "'Helvetica Neue', Arial, sans-serif"
  if (family === 'times') return "'Times New Roman', Georgia, serif"
  if (family === 'courier') return "'Courier New', monospace"
  return "'Liberation Sans','Arial',sans-serif"
}
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

// Wizualny edytor układu wyceny ("jak Canva") — pełna kontrola per-element
// (pozycja, rozmiar, kolor, czcionka) dla nagłówka, bloków sprzedawca/
// nabywca, tekstów, teł i logo. Blok pozycji towaru (itemsTable) i
// podsumowanie cen mają swój zestaw stylów (bo ich TREŚĆ jest dynamiczna —
// zależy od realnych pozycji/kwot wyceny), ale też w pełni stylowalny
// wygląd (czcionka/rozmiar/kolory). PDF generuje się dopiero na końcu, z
// zapisanego układu — patrz pdfFromLayout.js.
export default function QuoteLayoutEditor({ quote, client, contact, company, rows, totals, photoDataUrls, onSave, onClose }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const [layout, setLayout] = useState(() => quote?.layout_json || buildDefaultLayout())
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)

  const dragState = useRef(null)
  const resizeState = useRef(null)

  useEffect(() => () => {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ctx = buildTemplateContext({ quote, client, contact, company, rows, totals, photoDataUrls })
  const elements = layout.elements || []
  const selected = elements.find(e => e.id === selectedId) || null

  const updateElement = (id, patch) => {
    setLayout(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, ...patch } : e) }))
  }

  const addEl = (type) => {
    const el = newElement(type)
    if (!el) return
    setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }))
    setSelectedId(el.id)
  }
  const removeSelected = () => {
    if (!selectedId) return
    if (selected?.type === 'itemsTable') { toast.error(t('Nie można usunąć bloku pozycji towaru — bez niego wycena nie miałaby cen. Możesz go tylko przestylować lub przesunąć.')); return }
    setLayout(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== selectedId) }))
    setSelectedId(null)
  }
  const bringForward = () => selected && updateElement(selectedId, { z: (selected.z || 0) + 1 })
  const sendBackward = () => selected && updateElement(selectedId, { z: (selected.z || 0) - 1 })

  const resetToDefault = async () => {
    if (!await confirm(t('Przywrócić domyślny układ? Utracisz bieżące zmiany wizualne (dopóki nie zapisane, to bez ryzyka).'))) return
    setLayout(buildDefaultLayout())
    setSelectedId(null)
  }

  // --- Przeciąganie elementu (drag) ---
  const onElementMouseDown = (e, el) => {
    e.stopPropagation()
    setSelectedId(el.id)
    dragState.current = { id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, w: el.w, h: el.h }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
  }
  const onDragMove = (e) => {
    const d = dragState.current
    if (!d) return
    const dxMm = (e.clientX - d.startX) / PX_PER_MM
    const dyMm = (e.clientY - d.startY) / PX_PER_MM
    updateElement(d.id, {
      x: clamp(d.origX + dxMm, 0, PAGE_W - d.w),
      y: clamp(d.origY + dyMm, 0, PAGE_H - d.h),
    })
  }
  const onDragEnd = () => {
    dragState.current = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
  }

  // --- Zmiana rozmiaru (resize, uchwyty w rogach) ---
  const onResizeMouseDown = (e, el, corner) => {
    e.stopPropagation(); e.preventDefault()
    setSelectedId(el.id)
    resizeState.current = { id: el.id, corner, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h } }
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)
  }
  const onResizeMove = (e) => {
    const r = resizeState.current
    if (!r) return
    const dxMm = (e.clientX - r.startX) / PX_PER_MM
    const dyMm = (e.clientY - r.startY) / PX_PER_MM
    let { x, y, w, h } = r.orig
    if (r.corner.includes('e')) w = Math.max(12, r.orig.w + dxMm)
    if (r.corner.includes('s')) h = Math.max(6, r.orig.h + dyMm)
    if (r.corner.includes('w')) { w = Math.max(12, r.orig.w - dxMm); x = r.orig.x + dxMm }
    if (r.corner.includes('n')) { h = Math.max(6, r.orig.h - dyMm); y = r.orig.y + dyMm }
    updateElement(r.id, { x, y, w, h })
  }
  const onResizeEnd = () => {
    resizeState.current = null
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeEnd)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(layout)
      toast.success(t('Układ wyceny zapisany ✓ PDF będzie się teraz generował na jego podstawie.'))
      onClose()
    } catch (e) {
      toast.error(t('Nie udało się zapisać układu: ') + (e.message || e))
    }
    setSaving(false)
  }

  const handlePreviewPdf = async () => {
    const win = window.open('', '_blank')
    setPreviewBusy(true)
    try {
      const blob = await generateQuotePdfFromLayout({ layout, quote, client, contact, company, rows, totals, photoDataUrls })
      const url = URL.createObjectURL(blob)
      if (win) win.location.href = url; else window.open(url, '_blank')
    } catch (e) {
      if (win) win.close()
      toast.error(t('Nie udało się wygenerować podglądu: ') + (e.message || e))
    }
    setPreviewBusy(false)
  }

  const toolBtn = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.7)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: C.navy, flexWrap: 'wrap' }}>
        <div style={{ color: '#fff', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, marginRight: 8 }}>🎨 {t("Edytor wyglądu wyceny")}</div>
        <button style={toolBtn} onClick={() => addEl('text')}>+ {t("Tekst")}</button>
        <button style={toolBtn} onClick={() => addEl('rect')}>+ {t("Prostokąt (tło)")}</button>
        <button style={toolBtn} onClick={() => addEl('image')}>+ {t("Logo")}</button>
        <button style={toolBtn} onClick={bringForward} disabled={!selected}>{t("Warstwa wyżej")}</button>
        <button style={toolBtn} onClick={sendBackward} disabled={!selected}>{t("Warstwa niżej")}</button>
        <button style={{ ...toolBtn, color: C.red }} onClick={removeSelected} disabled={!selected}>🗑 {t("Usuń")}</button>
        <button style={toolBtn} onClick={resetToDefault}>{t("Przywróć domyślny układ")}</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={toolBtn} onClick={handlePreviewPdf} disabled={previewBusy}>{previewBusy ? t('Generuję…') : `👁 ${t("Podgląd PDF")}`}</button>
          <button style={{ ...toolBtn, background: C.white, color: C.text2 }} onClick={onClose}>{t("Anuluj")}</button>
          <button style={{ ...toolBtn, border: 'none', background: C.green, color: '#fff' }} onClick={handleSave} disabled={saving}>{saving ? t('Zapisuję…') : `💾 ${t("Zapisz układ")}`}</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24, background: '#525659' }}>
          <div
            onMouseDown={() => setSelectedId(null)}
            style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, background: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.5)', flexShrink: 0 }}
          >
            {[...elements].sort((a, b) => (a.z || 0) - (b.z || 0)).map(el => (
              <ElementBox
                key={el.id}
                el={el}
                ctx={ctx}
                selected={el.id === selectedId}
                onMouseDown={(e) => onElementMouseDown(e, el)}
                onResizeMouseDown={(e, corner) => onResizeMouseDown(e, el, corner)}
              />
            ))}
          </div>
        </div>

        <div style={{ width: 300, flexShrink: 0, background: C.white, borderLeft: `1px solid ${C.border}`, overflow: 'auto', padding: 16 }}>
          {!selected && <div style={{ fontSize: 11.5, color: C.muted }}>{t("Kliknij element na stronie, żeby edytować jego wygląd. Przeciągnij, żeby przesunąć — złap za róg, żeby zmienić rozmiar.")}</div>}
          {selected && <Inspector el={selected} onChange={(patch) => updateElement(selected.id, patch)} t={t} />}
        </div>
      </div>
    </div>
  )
}

function ElementBox({ el, ctx, selected, onMouseDown, onResizeMouseDown }) {
  const style = {
    position: 'absolute',
    left: el.x * PX_PER_MM, top: el.y * PX_PER_MM, width: el.w * PX_PER_MM, height: el.h * PX_PER_MM,
    cursor: 'move', boxSizing: 'border-box',
    outline: selected ? `2px solid ${C.blue}` : '1px dashed rgba(0,0,0,.12)',
    overflow: 'hidden',
  }
  let content = null
  if (el.type === 'rect') {
    content = <div style={{ width: '100%', height: '100%', background: el.bg || '#eee', opacity: el.opacity ?? 1, borderRadius: (el.radius || 0) * PX_PER_MM }} />
  } else if (el.type === 'image') {
    content = <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.04)', fontSize: 10, color: '#888', border: '1px dashed #ccc' }}>🖼 {el.src === 'logo' ? 'Logo' : 'Obraz'}</div>
  } else if (el.type === 'text') {
    const text = resolveTemplateText(el.text, ctx)
    content = (
      <div style={{
        width: '100%', height: '100%', background: el.bg || 'transparent',
        color: el.color || '#141414', fontFamily: cssFont(el.fontFamily), fontWeight: el.bold ? 700 : 400,
        fontSize: (el.fontSize || 10) * PX_PER_MM * 0.62, textAlign: el.align || 'left',
        whiteSpace: 'pre-wrap', padding: 2, lineHeight: 1.25,
      }}>{text}</div>
    )
  } else if (el.type === 'itemsTable') {
    content = <ItemsTablePreview el={el} ctx={ctx} />
  } else if (el.type === 'summary') {
    content = <SummaryPreview el={el} ctx={ctx} />
  }
  return (
    <div style={style} onMouseDown={onMouseDown}>
      {content}
      {selected && ['nw', 'ne', 'sw', 'se'].map(corner => (
        <div key={corner} onMouseDown={(e) => onResizeMouseDown(e, corner)} style={{
          position: 'absolute', width: 10, height: 10, background: C.blue, borderRadius: 3, zIndex: 5,
          top: corner.includes('n') ? -5 : undefined, bottom: corner.includes('s') ? -5 : undefined,
          left: corner.includes('w') ? -5 : undefined, right: corner.includes('e') ? -5 : undefined,
          cursor: (corner === 'nw' || corner === 'se') ? 'nwse-resize' : 'nesw-resize',
        }} />
      ))}
    </div>
  )
}

function ItemsTablePreview({ el, ctx }) {
  const { rows } = ctx
  const nameFontSize = (el.fontSize || 11) * PX_PER_MM * 0.6
  const specFontSize = (el.specFontSize || 8.5) * PX_PER_MM * 0.6
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', fontFamily: cssFont(el.fontFamily), padding: 2 }}>
      <div style={{ fontSize: 9, color: '#999', marginBottom: 4 }}>{rows.length} pozycji — podgląd, realna paginacja PDF widoczna w "Podgląd PDF"</div>
      {rows.slice(0, 4).map(r => (
        <div key={r._key} style={{
          display: 'flex', gap: 6, marginBottom: 4, padding: 4, borderRadius: 4 * PX_PER_MM * 0.4,
          background: el.cardBg || '#fff', border: `1px solid ${el.cardBorder || '#E1E3E7'}`,
        }}>
          <div style={{ width: 30, height: 30, background: '#f3f3f3', flexShrink: 0, borderRadius: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: nameFontSize, fontWeight: 700, color: el.textColor || '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || '—'}</div>
            {r.specification && <div style={{ fontSize: specFontSize, color: el.mutedColor || '#646464', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.specification}</div>}
          </div>
          <div style={{ fontSize: nameFontSize, fontWeight: 700, color: el.priceColor || '#B48C28', flexShrink: 0 }}>{fmt(r.finalPrice, 0)} PLN</div>
        </div>
      ))}
      {rows.length > 4 && <div style={{ fontSize: 9, color: '#999' }}>… +{rows.length - 4} więcej</div>}
    </div>
  )
}

function SummaryPreview({ el, ctx }) {
  const { totals } = ctx
  const fs = (el.fontSize || 10) * PX_PER_MM * 0.6
  const row = (label, val, big) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: big ? fs * 1.2 : fs, fontWeight: big ? 700 : 400, color: big ? (el.totalColor || '#B48C28') : (el.color || '#141414'), marginBottom: 3 }}>
      <span>{label}</span><span>{val}</span>
    </div>
  )
  return (
    <div style={{ width: '100%', height: '100%', borderTop: '1px solid #0A1628', paddingTop: 4, fontFamily: 'Arial,sans-serif' }}>
      {row('Netto:', `${fmt(totals.finalPrice, 2)} PLN`)}
      {row('VAT (23%):', `${fmt(totals.vatAmount, 2)} PLN`)}
      {row('TOTAL / RAZEM BRUTTO:', `${fmt(totals.finalPriceGross, 2)} PLN`, true)}
    </div>
  )
}

function Inspector({ el, onChange, t }) {
  const num = (v) => Math.round(v * 10) / 10
  const row = { marginBottom: 12 }
  const lbl = { fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em', display: 'block', marginBottom: 4 }
  const inp = { border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', fontSize: 11.5, width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'capitalize' }}>
        {{ text: '📝 Tekst', rect: '⬛ Prostokąt', image: '🖼 Obraz', itemsTable: '📦 Pozycje towaru', summary: '💰 Podsumowanie' }[el.type] || el.type}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div><label style={lbl}>X (mm)</label><input style={inp} type="number" value={num(el.x)} onChange={e => onChange({ x: Number(e.target.value) })} /></div>
        <div><label style={lbl}>Y (mm)</label><input style={inp} type="number" value={num(el.y)} onChange={e => onChange({ y: Number(e.target.value) })} /></div>
        <div><label style={lbl}>{t("Szerokość")} (mm)</label><input style={inp} type="number" value={num(el.w)} onChange={e => onChange({ w: Number(e.target.value) })} /></div>
        <div><label style={lbl}>{t("Wysokość")} (mm)</label><input style={inp} type="number" value={num(el.h)} onChange={e => onChange({ h: Number(e.target.value) })} /></div>
      </div>

      {el.type === 'text' && (
        <>
          <div style={row}><label style={lbl}>{t("Treść")}</label>
            <textarea style={{ ...inp, minHeight: 70, fontFamily: 'inherit' }} value={el.text || ''} onChange={e => onChange({ text: e.target.value })} />
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3 }}>{t("Możesz użyć: {{quote_number}}, {{date}}, {{valid_until}}, {{seller_block}}, {{buyer_block}}, {{notes}}, {{bank_account}}")}</div>
            {el.showIf && <div style={{ fontSize: 9.5, color: C.orange, marginTop: 3 }}>{t("Ten element pojawi się w PDF tylko gdy wycena ma wypełnione: ") + (el.showIf === 'notes' ? t('Objaśnienia') : t('numer konta w Ustawieniach'))}.</div>}
          </div>
          <div style={row}><label style={lbl}>{t("Czcionka")}</label>
            <select style={inp} value={el.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div><label style={lbl}>{t("Rozmiar")}</label><input style={inp} type="number" step="0.5" value={el.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} /></div>
            <div><label style={lbl}>{t("Wyrównanie")}</label>
              <select style={inp} value={el.align || 'left'} onChange={e => onChange({ align: e.target.value })}>
                <option value="left">{t("Do lewej")}</option><option value="center">{t("Środek")}</option><option value="right">{t("Do prawej")}</option>
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!el.bold} onChange={e => onChange({ bold: e.target.checked })} /> {t("Pogrubiony")}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div><label style={lbl}>{t("Kolor tekstu")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.color || '#141414'} onChange={e => onChange({ color: e.target.value })} /></div>
            <div><label style={lbl}>{t("Tło")}</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={!!el.bg} onChange={e => onChange({ bg: e.target.checked ? '#FFFFFF' : null })} />
                {el.bg && <input style={{ ...inp, padding: 2, height: 28 }} type="color" value={el.bg} onChange={e => onChange({ bg: e.target.value })} />}
              </div>
            </div>
          </div>
        </>
      )}

      {el.type === 'rect' && (
        <>
          <div style={row}><label style={lbl}>{t("Kolor")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.bg || '#F0F0F0'} onChange={e => onChange({ bg: e.target.value })} /></div>
          <div style={row}><label style={lbl}>{t("Przezroczystość")}</label><input type="range" min="0" max="1" step="0.05" value={el.opacity ?? 1} onChange={e => onChange({ opacity: Number(e.target.value) })} style={{ width: '100%' }} /></div>
          <div style={row}><label style={lbl}>{t("Zaokrąglenie rogów")} (mm)</label><input style={inp} type="number" value={el.radius || 0} onChange={e => onChange({ radius: Number(e.target.value) })} /></div>
        </>
      )}

      {el.type === 'image' && (
        <div style={{ fontSize: 11, color: C.muted }}>{t("Logo firmy MyChinaPal — pozycję i rozmiar zmieniasz przez przeciąganie/rogi powyżej.")}</div>
      )}

      {el.type === 'itemsTable' && (
        <>
          <div style={row}><label style={lbl}>{t("Czcionka")}</label>
            <select style={inp} value={el.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div><label style={lbl}>{t("Rozmiar nazwy")}</label><input style={inp} type="number" step="0.5" value={el.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} /></div>
            <div><label style={lbl}>{t("Rozmiar specyfikacji")}</label><input style={inp} type="number" step="0.5" value={el.specFontSize} onChange={e => onChange({ specFontSize: Number(e.target.value) })} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div><label style={lbl}>{t("Tło karty")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.cardBg} onChange={e => onChange({ cardBg: e.target.value })} /></div>
            <div><label style={lbl}>{t("Ramka karty")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.cardBorder} onChange={e => onChange({ cardBorder: e.target.value })} /></div>
            <div><label style={lbl}>{t("Kolor ceny")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.priceColor} onChange={e => onChange({ priceColor: e.target.value })} /></div>
            <div><label style={lbl}>{t("Kolor tekstu")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.textColor} onChange={e => onChange({ textColor: e.target.value })} /></div>
          </div>
          <div style={{ fontSize: 9.5, color: C.muted }}>{t("Ten blok pokazuje wszystkie pozycje towaru — liczba stron PDF dopasuje się automatycznie do ich liczby i długości opisów.")}</div>
        </>
      )}

      {el.type === 'summary' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div><label style={lbl}>{t("Rozmiar")}</label><input style={inp} type="number" step="0.5" value={el.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} /></div>
            <div><label style={lbl}>{t("Kolor tekstu")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.color} onChange={e => onChange({ color: e.target.value })} /></div>
          </div>
          <div style={row}><label style={lbl}>{t("Kolor sumy końcowej")}</label><input style={{ ...inp, padding: 2, height: 32 }} type="color" value={el.totalColor} onChange={e => onChange({ totalColor: e.target.value })} /></div>
        </>
      )}
    </div>
  )
}
