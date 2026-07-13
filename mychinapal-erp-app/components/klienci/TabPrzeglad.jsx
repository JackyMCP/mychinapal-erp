import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C, fmt, fmtPct } from '../../lib/theme'
import { useUI } from '../../lib/ui'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }
const secTitle = { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }
const infoRow = { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, gap: 10 }
const statBox = { background: C.bg, borderRadius: 10, padding: '12px 14px' }
const statLabel = { fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }
const statVal = { fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, marginTop: 3 }

function ring(pct, done) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `conic-gradient(${done ? C.green : C.blue} ${pct * 3.6}deg, ${C.border} 0)`,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: done ? 13 : 9.5, fontWeight: 800, color: done ? C.green : C.blue }}>
        {done ? '✓' : `${pct}%`}
      </div>
    </div>
  )
}

export default function TabPrzeglad({ client, marza, contacts, projects, progressByProject, documents, tasks, lastContactDays, onClientSaved, onOpenProject }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()

  const [notes, setNotes] = useState(client.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  useEffect(() => { setNotes(client.notes || ''); setSavedAt(null) }, [client.id])

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    const { data, error } = await supabase.from('clients').update({ notes, updated_at: new Date().toISOString() }).eq('id', client.id).select().single()
    setSavingNotes(false)
    if (error) { toast.error('Nie udało się zapisać notatki: ' + error.message); return }
    setSavedAt(new Date())
    if (data && onClientSaved) onClientSaved(data)
  }

  const przychod = Number(marza?.przychod) || 0
  const marzaVal = Number(marza?.marza) || 0
  const marzaPct = Number(marza?.marza_pct) || 0
  const contactLabel = lastContactDays === null || lastContactDays === undefined ? t('brak danych') : lastContactDays === 0 ? t('dzisiaj') : `${lastContactDays} ${t('dni temu')}`
  const contactColor = (lastContactDays === null || lastContactDays === undefined || lastContactDays > 45) ? C.red : lastContactDays <= 14 ? C.green : C.orange
  const primary = contacts && contacts[0]

  const sortedProjects = [...projects].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4)

  // oś czasu — najnowsze dokumenty i zadania, w jednym strumieniu
  const activity = [
    ...documents.slice(0, 6).map(d => ({ kind: 'doc', at: d.created_at, title: `${t('Wgrano dokument')}: ${d.file_name || t(d.category)}`, sub: t(d.category) })),
    ...tasks.slice(0, 6).map(tk => ({ kind: 'task', at: tk.completed_at || tk.created_at, title: tk.status === 'done' ? `${t('Zakończono zadanie')}: ${tk.title}` : `${t('Nowe zadanie')}: ${tk.title}`, sub: tk.due_date ? `${t('termin')} ${new Date(tk.due_date).toLocaleDateString('pl-PL')}` : '' })),
  ].filter(a => a.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr', gap: 16, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
          <div style={statBox}><div style={statLabel}>{t("Obrót YTD")}</div><div style={statVal}>{fmt(przychod, 0)} {t("PLN")}</div></div>
          <div style={statBox}><div style={statLabel}>{t("Marża YTD")}</div><div style={{ ...statVal, color: C.green }}>{fmt(marzaVal, 0)} {t("PLN")}</div></div>
          <div style={statBox}><div style={statLabel}>{t("Marża %")}</div><div style={statVal}>{fmtPct(marzaPct)}</div></div>
          <div style={statBox}><div style={statLabel}>{t("Ostatni kontakt")}</div><div style={{ ...statVal, fontSize: 13, color: contactColor }}>{contactLabel}</div></div>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={secTitle}>ℹ️ {t("Dane kontrahenta")}</div>
          <div style={infoRow}><span style={{ color: C.muted }}>{t("NIP")}</span><span style={{ fontWeight: 600 }}>{client.nip || '—'}</span></div>
          <div style={infoRow}><span style={{ color: C.muted }}>{t("KRS")}</span><span style={{ fontWeight: 600 }}>{client.krs || '—'}</span></div>
          <div style={infoRow}><span style={{ color: C.muted }}>{t("Adres")}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{client.address || '—'}</span></div>
          <div style={infoRow}><span style={{ color: C.muted }}>{t("Osoba kontaktowa")}</span><span style={{ fontWeight: 600 }}>{primary?.name || '—'}</span></div>
          <div style={infoRow}><span style={{ color: C.muted }}>{t("Telefon")}</span><span style={{ fontWeight: 600 }}>{primary?.phone || '—'}</span></div>
          <div style={{ ...infoRow, borderBottom: 'none' }}><span style={{ color: C.muted }}>{t("E-mail")}</span><span style={{ fontWeight: 600 }}>{primary?.email || '—'}</span></div>
        </div>

        <div style={card}>
          <div style={secTitle}>📝 {t("Notatki")}</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("Dodaj notatkę o tym kliencie…")}
            style={{ width: '100%', minHeight: 110, border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={handleSaveNotes} disabled={savingNotes}
              style={{ padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff', opacity: savingNotes ? .6 : 1 }}>
              {savingNotes ? t("Zapisywanie…") : t("Zapisz notatkę")}
            </button>
            {savedAt && <span style={{ fontSize: 10.5, color: C.green }}>{t("Zapisano")} {savedAt.toLocaleTimeString('pl-PL')}</span>}
          </div>
        </div>
      </div>

      <div>
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={secTitle}>🔗 {t("Powiązane zamówienia")} <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none' }}>— {t("najnowsze")}</span></div>
          {sortedProjects.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Ten klient nie ma jeszcze zarejestrowanych zamówień.")}</div>}
          {sortedProjects.map(p => {
            const prog = progressByProject[p.id] || { progressPct: 0, currentIndex: 1 }
            const isDone = prog.currentIndex === null
            return (
              <div key={p.id} onClick={() => onOpenProject && onOpenProject(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 9, cursor: 'pointer', transition: '.15s' }}>
                {ring(prog.progressPct, isDone)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.order_label}</div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{isDone ? t('Zakończone') : `${t('Etap')} ${prog.currentIndex}/9`}</div>
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>{p.value != null ? `${fmt(p.value, 0)} ${p.currency || 'PLN'}` : '—'}</div>
              </div>
            )
          })}
        </div>

        <div style={card}>
          <div style={secTitle}>🕓 {t("Ostatnia aktywność")}</div>
          {activity.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak zarejestrowanej aktywności.")}</div>}
          {activity.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < activity.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                background: a.kind === 'doc' ? C.glight : C.olight, color: a.kind === 'doc' ? C.green : C.orange,
              }}>{a.kind === 'doc' ? '📎' : '✅'}</div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{new Date(a.at).toLocaleDateString('pl-PL')}{a.sub ? ` · ${a.sub}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
