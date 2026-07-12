import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'

const fieldStyle = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: C.text }
const labelStyle = { display: 'block', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.2px', marginBottom: 5 }

export default function ProfitTable({ project, onSaved }) {
  const [koszt, setKoszt] = useState(project.value ?? '')
  const [zakup, setZakup] = useState(project.est_zakup ?? '')
  const [transport, setTransport] = useState(project.est_transport ?? '')
  const [clo, setClo] = useState(project.est_clo ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setKoszt(project.value ?? '')
    setZakup(project.est_zakup ?? '')
    setTransport(project.est_transport ?? '')
    setClo(project.est_clo ?? '')
  }, [project.id])

  const num = (v) => (v === '' || v === null ? 0 : Number(v))
  const zysk = num(koszt) - num(zakup) - num(transport) - num(clo)
  const marzaPct = num(koszt) > 0 ? (zysk / num(koszt)) * 100 : 0

  const handleBlurSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('projects').update({
      value: koszt === '' ? null : Number(koszt),
      est_zakup: zakup === '' ? null : Number(zakup),
      est_transport: transport === '' ? null : Number(transport),
      est_clo: clo === '' ? null : Number(clo),
    }).eq('id', project.id)
    setSaving(false)
    if (error) { alert('Nie udało się zapisać: ' + error.message); return }
    onSaved && onSaved({ ...project, value: Number(koszt) || null, est_zakup: Number(zakup) || null, est_transport: Number(transport) || null, est_clo: Number(clo) || null })
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Podsumowanie — szacowany zysk
        {saving && <span style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>zapisywanie…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, alignItems: 'end' }}>
        <div><label style={labelStyle}>Koszt zakupu towaru (Chiny)</label><input style={fieldStyle} type="number" value={zakup} onChange={e => setZakup(e.target.value)} onBlur={handleBlurSave} /></div>
        <div><label style={labelStyle}>Koszt dla klienta (netto)</label><input style={fieldStyle} type="number" value={koszt} onChange={e => setKoszt(e.target.value)} onBlur={handleBlurSave} /></div>
        <div><label style={labelStyle}>Szac. koszt transportu</label><input style={fieldStyle} type="number" value={transport} onChange={e => setTransport(e.target.value)} onBlur={handleBlurSave} /></div>
        <div><label style={labelStyle}>Szac. cło</label><input style={fieldStyle} type="number" value={clo} onChange={e => setClo(e.target.value)} onBlur={handleBlurSave} /></div>
        <div style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, borderRadius: 10, padding: '8px 10px', color: '#fff' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>Szacowany zysk</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>{fmt(zysk, 0)} PLN</div>
          <div style={{ fontSize: 9.5, color: '#4ADE80', fontWeight: 700, marginTop: 2 }}>{marzaPct.toFixed(1)}% marży</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Wartości zapisują się automatycznie po opuszczeniu pola. Prefilled z arkusza Marża_per_zlecenie tam gdzie było to możliwe — dopraw ręcznie jeśli się zmieniły.</div>
    </div>
  )
}
