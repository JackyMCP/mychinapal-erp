import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'

const labelStyle = { display: 'block', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.2px', marginBottom: 6, lineHeight: 1.3, overflowWrap: 'break-word' }
const fieldWrap = { display: 'flex', flexDirection: 'column' }
const fieldStyle = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', fontSize: 12.5, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: C.text, boxSizing: 'border-box' }

export default function ProfitTable({ project, onSaved }) {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()

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
    if (error) { toast.error('Nie udało się zapisać: ' + error.message); return }
    onSaved && onSaved({ ...project, value: Number(koszt) || null, est_zakup: Number(zakup) || null, est_transport: Number(transport) || null, est_clo: Number(clo) || null })
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t("Podsumowanie — szacowany zysk")}
        {saving && <span style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>{t("zapisywanie…")}</span>}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) 160px', gap: 16, alignItems: 'stretch', minWidth: 640 }}>
        <div style={fieldWrap}><label style={labelStyle}>{t("Koszt zakupu towaru (Chiny)")}</label><input style={fieldStyle} type="number" value={zakup} onChange={e => setZakup(e.target.value)} onBlur={handleBlurSave} /></div>
        <div style={fieldWrap}><label style={labelStyle}>{t("Koszt dla klienta (netto)")}</label><input style={fieldStyle} type="number" value={koszt} onChange={e => setKoszt(e.target.value)} onBlur={handleBlurSave} /></div>
        <div style={fieldWrap}><label style={labelStyle}>{t("Szac. koszt transportu")}</label><input style={fieldStyle} type="number" value={transport} onChange={e => setTransport(e.target.value)} onBlur={handleBlurSave} /></div>
        <div style={fieldWrap}><label style={labelStyle}>{t("Szac. cło")}</label><input style={fieldStyle} type="number" value={clo} onChange={e => setClo(e.target.value)} onBlur={handleBlurSave} /></div>
        <div style={{ ...fieldWrap, background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, borderRadius: 8, padding: '9px 12px', color: '#fff', justifyContent: 'center', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>{t("Szacowany zysk")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{fmt(zysk, 0)} {t("PLN")}</div>
          <div style={{ fontSize: 9.5, color: '#4ADE80', fontWeight: 700, marginTop: 3 }}>{marzaPct.toFixed(1)}{t("% marży")}</div>
        </div>
      </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>{t(
        "Wartości zapisują się automatycznie po opuszczeniu pola. Prefilled z arkusza Marża_per_zlecenie tam gdzie było to możliwe — dopraw ręcznie jeśli się zmieniły."
      )}</div>
    </div>
  );
}
