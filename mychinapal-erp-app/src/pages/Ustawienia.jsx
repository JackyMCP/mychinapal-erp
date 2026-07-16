import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import { FONT_OPTIONS, DEFAULT_TYPOGRAPHY, loadTypography, saveTypography, applyTypography } from '../lib/typography'

const label = { fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: C.text }
const field = { border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, width: '100%', outline: 'none', boxSizing: 'border-box' }

export default function Ustawienia() {
  const { t } = useLang()
  const { isZarzad } = useAuth()
  const { toast } = useUI()

  const [settings, setSettings] = useState(DEFAULT_TYPOGRAPHY)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTypography().then((s) => { setSettings(s); setLoading(false) })
  }, [])

  // Podgląd na żywo — zastosuj na całej apce OD RAZU przy przesuwaniu
  // suwaków, jeszcze przed kliknięciem "Zapisz" — łatwiej ocenić efekt.
  const patch = (p) => {
    const next = { ...settings, ...p }
    setSettings(next)
    applyTypography(next)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await saveTypography(settings)
    setSaving(false)
    if (error) { toast.error(t('Nie udało się zapisać: ') + error.message); return }
    toast.success(t('Zapisano ustawienia typografii — obowiązują dla całej firmy.'))
  }

  const handleReset = () => {
    setSettings(DEFAULT_TYPOGRAPHY)
    applyTypography(DEFAULT_TYPOGRAPHY)
  }

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div>
      <PageHeader title={t("⚙️ Ustawienia")} subtitle={t("Wygląd aplikacji i inne ustawienia firmowe")} />
      <div style={{ padding: '16px 22px', maxWidth: 640 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>{t("🔤 Typografia")}</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
            {t("Dotyczy tekstu w całej aplikacji (nie zmienia logo i nagłówków sekcji). Ustawienie jest wspólne dla całej firmy.")}
          </div>

          {!isZarzad && (
            <div style={{ fontSize: 10.5, color: C.orange, background: C.olight, borderRadius: 8, padding: '8px 11px', marginBottom: 14 }}>
              {t("Tylko zarząd może zapisać zmiany — możesz je podglądnąć, ale przycisk „Zapisz” jest zablokowany.")}
            </div>
          )}

          <label style={label}>{t("Czcionka")}</label>
          <select style={{ ...field, marginBottom: 16 }} value={settings.fontFamily} onChange={e => patch({ fontFamily: e.target.value })} disabled={!isZarzad}>
            {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          <label style={label}>{t("Odstępy między literami")}: {settings.letterSpacing.toFixed(2)}px</label>
          <input type="range" min={-0.5} max={2} step={0.05} value={settings.letterSpacing} disabled={!isZarzad}
            onChange={e => patch({ letterSpacing: Number(e.target.value) })} style={{ width: '100%', marginBottom: 16 }} />

          <label style={label}>{t("Odstępy między liniami")}: ×{settings.lineHeightScale.toFixed(2)}</label>
          <input type="range" min={0.85} max={1.3} step={0.01} value={settings.lineHeightScale} disabled={!isZarzad}
            onChange={e => patch({ lineHeightScale: Number(e.target.value) })} style={{ width: '100%', marginBottom: 16 }} />

          <div style={{ background: C.bg, borderRadius: 9, padding: '12px 14px', marginBottom: 18, fontSize: 13 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>{t("Podgląd")}</div>
            {t("Tak wygląda przykładowy tekst w aplikacji — wycena zawiera 3 pozycje, klient: ACME Sp. z o.o., termin realizacji: 25 dni roboczych.")}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleReset} disabled={!isZarzad} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: isZarzad ? 'pointer' : 'not-allowed', color: C.text2, opacity: isZarzad ? 1 : .5 }}>
              {t("Domyślne")}
            </button>
            <button onClick={handleSave} disabled={saving || !isZarzad} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: (saving || !isZarzad) ? 'not-allowed' : 'pointer', opacity: (saving || !isZarzad) ? .5 : 1 }}>
              {saving ? t("Zapisywanie…") : t("Zapisz")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
