import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import useIsMobile from '../../lib/useIsMobile'

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
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()

  const [values, setValues] = useState(Object.fromEntries(FIELDS.map(([k]) => [k, project[k] ?? ''])))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(Object.fromEntries(FIELDS.map(([k]) => [k, project[k] ?? ''])))
  }, [project.id])

  const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v))
  // "Koszt towaru w Chinach" to WYŁĄCZNIE wartość informacyjna (ile towar
  // faktycznie kosztował u dostawcy) — NIE liczy się osobno do realnego zysku.
  // Zonglu (nasza chińska firma) stanowi jedność z polską spółką, więc liczy
  // się realny przepływ gotówki: ile FAKTYCZNIE przelaliśmy do Zonglu
  // (real_kwota_zonglu) — to ona zastępuje koszt towaru w rachunku zysku.
  // Różnica między tymi dwiema wartościami to nadwyżka zostająca w Zonglu
  // ponad realny koszt towaru (patrz wskaźnik "nadwyżka" niżej).
  const costFields = FIELDS.filter(([k]) => k !== 'real_przychod_netto' && k !== 'real_koszt_towaru')
  const totalCosts = costFields.reduce((s, [k]) => s + num(values[k]), 0)
  const zysk = num(values.real_przychod_netto) - totalCosts
  const marzaPct = num(values.real_przychod_netto) > 0 ? (zysk / num(values.real_przychod_netto)) * 100 : 0
  const nadwyzkaZonglu = num(values.real_kwota_zonglu) - num(values.real_koszt_towaru)

  const handleChange = (key, v) => setValues(prev => ({ ...prev, [key]: v }))

  const handleBlurSave = async () => {
    setSaving(true)
    const payload = Object.fromEntries(FIELDS.map(([k]) => [k, values[k] === '' ? null : Number(values[k])]))
    const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
    setSaving(false)
    if (error) { toast.error('Nie udało się zapisać: ' + error.message); return }
    onSaved && onSaved({ ...project, ...payload })
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t("Realne koszty i zysk")} <span style={{ fontWeight: 600, textTransform: 'none', color: C.muted, fontSize: 10.5 }}>{t("— uzupełniaj w miarę jak faktury/płatności są opłacane")}</span>
        {saving && <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>{t("zapisywanie…")}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 16 }}>
        {FIELDS.map(([key, label]) => (
          <div key={key} style={fieldWrap}>
            <label style={labelStyle}>{label}</label>
            <input style={fieldStyle} type="number" value={values[key]} onChange={e => handleChange(key, e.target.value)} onBlur={handleBlurSave} />
          </div>
        ))}
      </div>
      {(values.real_koszt_towaru !== '' && values.real_kwota_zonglu !== '' && nadwyzkaZonglu !== 0) && (
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10 }}>
          {nadwyzkaZonglu > 0
            ? '💰 ' + t('Nadwyżka przelana do Zonglu ponad koszt towaru: ') + fmt(nadwyzkaZonglu, 0) + ' ' + t('PLN') + ' ' + t('(nie liczy się jako koszt — zostaje w firmie)')
            : '⚠️ ' + t('Przelano do Zonglu mniej niż wynosi koszt towaru o: ') + fmt(Math.abs(nadwyzkaZonglu), 0) + ' ' + t('PLN')}
        </div>
      )}
      <div style={{ marginTop: 16, background: `linear-gradient(135deg, ${C.navy}, #0F3D24)`, borderRadius: 10, padding: '12px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>{t("Realny zysk")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginTop: 2 }}>{fmt(zysk, 0)} {t("PLN")}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4ADE80' }}>{marzaPct.toFixed(1)}{t("% marży rzeczywistej")}</div>
      </div>
    </div>
  );
}
