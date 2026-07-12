import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

export default function CompanyDirection({ currentUserId }) {
  const {
    t
  } = useLang();

  const [row, setRow] = useState(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('company_direction').select('*, profiles(full_name)').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      setRow(data)
      setText(data?.content || '')
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    if (row) {
      const { error } = await supabase.from('company_direction').update({ content: text, updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', row.id)
      if (error) { setSaving(false); alert('Nie udało się zapisać: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('company_direction').insert({ content: text, updated_by: currentUserId }).select().single()
      if (error) { setSaving(false); alert('Nie udało się zapisać: ' + error.message); return }
      setRow(data)
    }
    // odśwież z joinem, żeby mieć nazwisko autora
    const { data: fresh } = await supabase.from('company_direction').select('*, profiles(full_name)').order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (fresh) setRow(fresh)
    setSaving(false)
    setEditing(false)
  }

  if (loading) return null

  const lastUpdated = row?.updated_at ? new Date(row.updated_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
      backgroundSize: '300% 300%', animation: 'cdGradientShift 14s ease infinite',
      borderRadius: 18, padding: '22px 26px', color: '#fff',
      boxShadow: '0 12px 34px rgba(10,22,40,.35)',
    }}>
      <style>{`
        @keyframes cdGradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes cdFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-10px) scale(1.08); } }
        @keyframes cdFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-12px,12px) scale(1.05); } }
        @keyframes cdPulse { 0%,100% { opacity: .55; box-shadow: 0 0 0 0 rgba(59,130,246,.45); } 50% { opacity: 1; box-shadow: 0 0 0 8px rgba(59,130,246,0); } }
        @keyframes cdFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {/* dekoracyjne, rozmyte "blobs" w tle */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'cdFloat1 9s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -70, left: -30, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.3), transparent 70%)', filter: 'blur(12px)', animation: 'cdFloat2 11s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)',
            animation: 'cdPulse 3.2s ease-in-out infinite',
          }}>🧭</div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: '.2px' }}>{t("Kierunek firmy")}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2 }}>{t("widoczne tylko dla Zarządu")}</div>
          </div>
        </div>
        {!editing && (
          <span onClick={() => setEditing(true)} style={{
            fontSize: 11.5, fontWeight: 700, color: '#93C5FD', cursor: 'pointer', padding: '6px 13px',
            borderRadius: 8, border: '1px solid rgba(147,197,253,.35)', background: 'rgba(147,197,253,.08)', whiteSpace: 'nowrap',
          }}>{t("✏️ Edytuj")}</span>
        )}
      </div>
      {editing ? (
        <div style={{ position: 'relative' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={t("Opisz aktualne priorytety i kierunek firmy…")} autoFocus
            style={{ width: '100%', minHeight: 100, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? t("Zapisywanie…") : t("Zapisz")}</button>
            <button onClick={() => { setEditing(false); setText(row?.content || '') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t("Anuluj")}</button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', animation: 'cdFadeUp .4s ease' }}>
          {row?.content ? (
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 3, borderRadius: 3, background: 'linear-gradient(180deg, #3B82F6, #7C3AED)', flexShrink: 0 }} />
              <div style={{
                fontFamily: "'Syne',sans-serif", fontSize: 21, fontWeight: 600, lineHeight: 1.45,
                letterSpacing: '.1px', textShadow: '0 1px 12px rgba(59,130,246,.25)',
              }}>{row.content}</div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', fontStyle: 'italic' }}>{t(
              "Brak wpisu — kliknij „Edytuj\", żeby dodać kierunek firmy na ten kwartał."
            )}</div>
          )}
          {row?.content && (
            <div style={{ marginTop: 16, fontSize: 10.5, color: 'rgba(255,255,255,.4)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#93C5FD' }} />
              {t("Zaktualizowano")} {lastUpdated}{row.profiles?.full_name ? ` przez ${row.profiles.full_name}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
