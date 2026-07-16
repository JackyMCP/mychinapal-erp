import { useState } from 'react'
import { C } from '../../lib/theme'
import { useLang } from '../../lib/i18n/LanguageContext'
import { WIDGET_REGISTRY } from '../../lib/dashboardWidgets'

// Panel "Dostosuj widgety" — pokaż/ukryj każdy widget Dashboardu i zmień ich
// kolejność przeciąganiem (natywne HTML5 drag&drop, bez dodatkowych
// bibliotek). Zapis jest per-użytkownik — patrz dashboardLayout.js.
export default function DashboardWidgetSettings({ layout, isZarzad, onChange, onClose, onSave, saving }) {
  const { t } = useLang()
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const visibleEntries = layout.filter(e => {
    const def = WIDGET_REGISTRY.find(w => w.id === e.id)
    return def && (!def.zarzadOnly || isZarzad)
  })

  const toggle = (id) => {
    onChange(layout.map(e => (e.id === id ? { ...e, visible: !e.visible } : e)))
  }

  const reorder = (fromId, toId) => {
    if (fromId === toId) return
    const ids = visibleEntries.map(e => e.id)
    const fromIdx = ids.indexOf(fromId)
    const toIdx = ids.indexOf(toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = ids.slice()
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, fromId)
    // przepisz pełny layout (łącznie z widgetami niedostępnymi dla tej roli)
    // w nowej kolejności widocznych + reszta na końcu bez zmian
    const others = layout.filter(e => !reordered.includes(e.id))
    const byId = Object.fromEntries(layout.map(e => [e.id, e]))
    onChange([...reordered.map(id => byId[id]), ...others])
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t('⚙️ Dostosuj widgety')}</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{t('Odznacz, żeby ukryć, albo przeciągnij za uchwyt ⠿, żeby zmienić kolejność. Ustawienie jest tylko Twoje.')}</div>

        {visibleEntries.map(e => {
          const def = WIDGET_REGISTRY.find(w => w.id === e.id)
          if (!def) return null
          const isDragOver = overId === e.id && dragId !== e.id
          return (
            <div key={e.id}
              draggable
              onDragStart={() => setDragId(e.id)}
              onDragOver={(ev) => { ev.preventDefault(); setOverId(e.id) }}
              onDragLeave={() => setOverId(prev => (prev === e.id ? null : prev))}
              onDrop={(ev) => { ev.preventDefault(); reorder(dragId, e.id); setDragId(null); setOverId(null) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
                border: `1.5px ${isDragOver ? 'dashed' : 'solid'} ${isDragOver ? C.blue : C.border}`,
                background: dragId === e.id ? C.bg : '#fff', marginBottom: 7, cursor: 'grab',
                opacity: dragId === e.id ? 0.5 : 1, transition: 'border-color .1s ease',
              }}>
              <span style={{ fontSize: 14, color: C.muted, cursor: 'grab' }}>⠿</span>
              <span style={{ fontSize: 15 }}>{def.icon}</span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{t(def.label)}</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={e.visible} onChange={() => toggle(e.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              </label>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('Anuluj')}</button>
          <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? t('Zapisywanie…') : t('Zapisz')}
          </button>
        </div>
      </div>
    </div>
  )
}
