import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import { useAuth } from '../context/AuthContext'

// Panel sterowania zarządu — dostępny dla KAŻDEGO członka zarządu (nie tylko
// jednej osoby), klikalny z bloku imię/rola w Sidebarze (gated na isZarzad
// tam, gdzie się otwiera). Pokazuje pełną listę kont (profiles) i pozwala
// dodać nowe konto: zarząd od razu nadaje e-mail + hasło, bez procesu
// potwierdzenia mailem — realizowane przez edge function admin-create-user
// (service-role, auth.admin.createUser z email_confirm:true).
const inputStyle = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', fontSize: 12.5, fontFamily: "'Syne',sans-serif", fontWeight: 600, color: C.text, boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.2px', marginBottom: 5 }

export default function AdminPanel({ onClose }) {
  const { t } = useLang()
  const { toast } = useUI()
  const { profile: myProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'pracownik' })

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (error) { toast.error(t('Nie udało się pobrać listy kont: ') + error.message); setLoading(false); return }
    setProfiles(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const resetForm = () => setForm({ email: '', password: '', full_name: '', role: 'pracownik' })

  const handleCreate = async () => {
    const email = form.email.trim()
    const password = form.password
    const fullName = form.full_name.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error(t('Podaj poprawny adres e-mail.')); return }
    if (!password || password.length < 6) { toast.error(t('Hasło musi mieć co najmniej 6 znaków.')); return }
    if (!fullName) { toast.error(t('Podaj imię i nazwisko.')); return }

    setSaving(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email, password, full_name: fullName, role: form.role },
    })
    setSaving(false)

    if (error || !data?.ok) {
      const code = data?.error
      const msg = code === 'email_taken' ? t('Ten adres e-mail jest już zarejestrowany.')
        : code === 'forbidden' ? t('Brak uprawnień — tylko zarząd może dodawać konta.')
        : (error?.message || data?.details || t('Nie udało się utworzyć konta.'))
      toast.error(msg)
      return
    }

    toast.success(t('Konto utworzone: ') + fullName)
    resetForm()
    setShowForm(false)
    load()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 22, width: 620, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{t("🛡️ Panel sterowania zarządu")}</div>
          <span onClick={onClose} style={{ fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>{t("✕ Zamknij")}</span>
        </div>

        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
          {t("Zarządzanie kontami użytkowników aplikacji. Każdy członek zarządu może dodać nowe konto — hasło nadajesz od razu, bez potrzeby potwierdzania e-mailem.")}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <span onClick={() => setShowForm(s => !s)} style={{
            fontSize: 11.5, fontWeight: 700, color: '#fff', background: C.blue, padding: '7px 14px',
            borderRadius: 8, cursor: 'pointer',
          }}>
            {showForm ? t("Anuluj") : t("+ Dodaj nowe konto")}
          </span>
        </div>

        {showForm && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>{t("Imię i nazwisko")}</label>
                <input style={inputStyle} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder={t("np. Anna Kowalska")} />
              </div>
              <div>
                <label style={labelStyle}>{t("Rola")}</label>
                <select style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="pracownik">{t("Pracownik")}</option>
                  <option value="zarzad">{t("Zarząd")}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("E-mail (login)")}</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="osoba@mychinapal.pl" />
              </div>
              <div>
                <label style={labelStyle}>{t("Hasło startowe")}</label>
                <input style={inputStyle} type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={t("min. 6 znaków")} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 12 }}>
              {t("Osoba zaloguje się od razu tym e-mailem i hasłem — może je potem zmienić w Ustawieniach.")}
            </div>
            <span onClick={saving ? undefined : handleCreate} style={{
              display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#fff',
              background: saving ? C.muted : C.green, padding: '8px 16px', borderRadius: 8,
              cursor: saving ? 'default' : 'pointer',
            }}>
              {saving ? t("Tworzenie…") : t("✓ Utwórz konto")}
            </span>
          </div>
        )}

        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 8 }}>
          {t("Istniejące konta")} ({profiles.length})
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '20px 0', textAlign: 'center' }}>{t("Wczytywanie…")}</div>
          ) : profiles.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '20px 0', textAlign: 'center' }}>{t("Brak kont.")}</div>
          ) : profiles.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '10px 4px', borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.full_name}
                  {p.id === myProfile?.id && <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 500 }}>({t("Ty")})</span>}
                </div>
                <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, flexShrink: 0,
                background: p.role === 'zarzad' ? C.bmid : C.glight,
                color: p.role === 'zarzad' ? C.blue : C.green,
              }}>
                {p.role === 'zarzad' ? t('Zarząd') : t('Pracownik')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
