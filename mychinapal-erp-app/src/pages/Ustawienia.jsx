import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import { supabase } from '../lib/supabaseClient'
import { FONT_OPTIONS, DEFAULT_TYPOGRAPHY, loadTypography, saveTypography, applyTypography } from '../lib/typography'
import Avatar from '../components/ui/Avatar'

const label = { fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: C.text }
const field = { border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, width: '100%', outline: 'none', boxSizing: 'border-box' }
const MAX_AVATAR_MB = 5
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function Ustawienia() {
  const { t } = useLang()
  const { isZarzad, profile, refreshProfile } = useAuth()
  const { toast } = useUI()

  const [settings, setSettings] = useState(DEFAULT_TYPOGRAPHY)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef(null)

  useEffect(() => {
    loadTypography().then((s) => { setSettings(s); setLoading(false) })
  }, [])

  // Zdjęcie profilowe — wgrywane do własnego folderu w buckecie "avatary"
  // (RLS pozwala każdemu wgrywać/nadpisywać WYŁĄCZNIE własny folder, patrz
  // storage.objects policy avatary_insert/avatary_update). Nadpisujemy zawsze
  // ten sam plik ("avatar"), żeby nie zaśmiecać bucketu starymi wersjami —
  // publiczny URL zostaje ten sam, dokładamy tylko znacznik czasu w query
  // stringu, żeby przeglądarka/CDN nie pokazywały starego zdjęcia z cache.
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) { toast.error(t('Dozwolone formaty: JPG, PNG, WEBP, GIF.')); return }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) { toast.error(`${t('Plik jest za duży (max')} ${MAX_AVATAR_MB}MB).`); return }
    if (!profile?.id) return
    setAvatarUploading(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${profile.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatary').upload(path, file, { upsert: true })
    if (upErr) { setAvatarUploading(false); toast.error(t('Nie udało się wgrać zdjęcia: ') + upErr.message); return }
    const { data: pub } = supabase.storage.from('avatary').getPublicUrl(path)
    const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`
    const { error: updErr } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id)
    setAvatarUploading(false)
    if (updErr) { toast.error(t('Nie udało się zapisać zdjęcia w profilu: ') + updErr.message); return }
    await refreshProfile?.()
    toast.success(t('Zdjęcie profilowe zapisane — pojawi się teraz przy Twoich wiadomościach na czatach.'))
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

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
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>{t("🖼️ Zdjęcie profilowe")}</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
            {t("Będzie widoczne przy Twoich wiadomościach na wszystkich czatach (Czat Zarządu, czaty klientów, zamówień) i w kanale głosowym.")}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={64} fontSize={22} />
            <div>
              <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              <button onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: avatarUploading ? 'default' : 'pointer', opacity: avatarUploading ? .6 : 1 }}>
                {avatarUploading ? t('Wgrywanie…') : (profile?.avatar_url ? t('Zmień zdjęcie') : t('Wgraj zdjęcie'))}
              </button>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>{t('JPG, PNG, WEBP lub GIF, max')} {MAX_AVATAR_MB}MB.</div>
            </div>
          </div>
        </div>
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
