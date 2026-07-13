import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C } from '../../lib/theme'

const chip = (active) => ({ padding: '7px 13px', borderRadius: 8, border: `1px solid ${active ? C.navy : C.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? C.navy : '#fff', color: active ? '#fff' : C.text2 })

export default function TabDokumenty({ docs, loading }) {
  const { t } = useLang()
  const [filter, setFilter] = useState('all')

  const filtered = docs.filter(d => filter === 'all' || d.doc_type === filter)

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={chip(filter === 'all')} onClick={() => setFilter('all')}>{t("Wszystkie")}</div>
        <div style={chip(filter === 'PZ')} onClick={() => setFilter('PZ')}>{t("Przyjęcia (PZ)")}</div>
        <div style={chip(filter === 'WZ')} onClick={() => setFilter('WZ')}>{t("Wydania (WZ)")}</div>
      </div>

      {filtered.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 16, textAlign: 'center' }}>{t("Brak dokumentów magazynowych.")}</div>}

      {filtered.map(d => {
        const isPZ = d.doc_type === 'PZ'
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 9 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: isPZ ? C.glight : C.blight, color: isPZ ? C.green : C.blue }}>{d.doc_type}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{d.doc_number} {d.projects?.order_label ? `— ${t('zamówienie')} ${d.projects.order_label}` : ''}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                {d.products?.name || '—'} × {d.quantity} {d.products?.unit || ''} · {new Date(d.doc_date).toLocaleDateString('pl-PL')}
                {d.note ? ` · ${d.note}` : ''}
              </div>
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, color: isPZ ? C.text : C.red, whiteSpace: 'nowrap' }}>{isPZ ? '+' : '−'}{d.quantity} {d.products?.unit || ''}</div>
          </div>
        )
      })}
    </div>
  )
}
