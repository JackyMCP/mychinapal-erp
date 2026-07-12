import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'

const labelStyle = { display: 'block', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.2px', marginBottom: 6 }
const fieldWrap = { display: 'flex', flexDirection: 'column' }
const fieldStyle = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', fontSize: 12.5, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: C.text, boxSizing: 'border-box' }

const FIELDS = [
  ['real_przychod_netto', 'Przychód od klienta (netto)'],
  ['real_koszt_towaru', 'Koszt towaru w Chinach'],
  ['real_kwota_zonglu', 'Kwota przelana do Zonglu'],
  ['real_odprawa_chiny', 'Koszt odprawy celnej w Chinach'],
  ['real_transport_chiny', 'Koszt transportu wewnątrz Chin'],
  ['real_transport_polska', 'Koszt transportu do Polski'],
  ['real_odprawa_polska', 'Koszt odprawy celnej w Polsce (SAD)'],
  ['real_dostawa_klient', 'Koszt dostawy do klienta'],
]

export default function RealCostsTable({ project, onSaved }) {
  const [values, setValues] = useState(Object.fromEntries(FIELDS.map(([k]) => [k, project[k] ?? ''])))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(Object.fromEntries(FIELDS.map(([k]) => [k, project[k] ?? ''])))
  }, [project.id])

  const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v))
  const costFields = FIELDS.filter(([k]) => k !== 'real_przychod_netto')
  const totalCosts = costFields.reduce((s, [k]) => s + num(values[k]), 0)
  const zysk = num(values.real_przychod_netto) - totalCosts
  const marzaPct = num(values.real_przychod_netto) > 0 ? (zysk / num(values.real_przychod_netto)) * 100 : 0

  const handleChange = (key, v) => setValues(prev => ({ ...prev, [key]: v }))

  const handleBlurSave = async () => {
    setSaving(true)
    const payload = Object.fromEntries(FIELDS.map(([k]) => [k, values[k] === '' ? null : Number(values[k])]))
    const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
    setSaving(false)
    if (error) { alert('Nie udało się zapisać: ' + error.message); return }
    onSaved && onSaved({ ...project, ...payload })
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Realne koszty i zysk <span style={{ fontWeight: 600, textTransform: 'none', color: C.muted, fontSize: 10.5 }}>— uzupełniaj w miarę jak faktury/płatności są opłacane</span>
        {saving && <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>zapisywanie…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16 }}>
        {FIELDS.map(([key, label]) => (
          <div key={key} style={fieldWrap}>
            <label style={labelStyle}>{label}</label>
            <input style={fieldStyle} type="number" value={values[key]} onChange={e => handleChange(key, e.target.value)} onBlur={handleBlurSave} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, background: `linear-gradient(135deg, ${C.navy}, #0F3D24)`, borderRadius: 10, padding: '12px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>Realny zysk</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginTop: 2 }}>{fmt(zysk, 0)} PLN</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4ADE80' }}>{marzaPct.toFixed(1)}% marży rzeczywistej</div>
      </div>
    </div>
  )
}
