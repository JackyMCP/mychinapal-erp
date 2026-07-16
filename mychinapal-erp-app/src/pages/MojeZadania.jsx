import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import EmptyState from '../components/ui/EmptyState'
import AllTasksPanel from '../components/dashboard/AllTasksPanel'

const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })

function daysUntil(due) {
  return Math.ceil((new Date(due) - new Date(new Date().toDateString())) / 86400000)
}

export default function MojeZadania() {
  const { t } = useLang()
  const { profile, isZarzad } = useAuth()
  const { toast } = useUI()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(null)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!profile) return
    setLoading(true)
    const [tasksRes, profilesRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('assigned_to', profile.id),
      supabase.from('profiles').select('id,full_name'),
    ])
    setTasks(tasksRes.data || [])
    setProfiles(profilesRes.data || [])
    if (!assignee) setAssignee(profile.id)
    setLoading(false)
  }
  useEffect(() => { load() }, [profile?.id])

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(), assigned_to: assignee || profile.id, assigned_by: profile.id,
      due_date: dueDate || null, status: 'todo',
    })
    setSaving(false)
    if (error) { toast.error('Nie udało się dodać zadania: ' + error.message); return }
    setTitle(''); setDueDate(''); setShowAdd(false)
    load()
  }

  const setStatus = async (task, status) => {
    const patch = { status }
    if (status === 'in_progress') patch.started_at = new Date().toISOString()
    if (status === 'done') patch.completed_at = new Date().toISOString()
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (error) { toast.error('Nie udało się zaktualizować zadania: ' + error.message); return }
    load()
  }

  const active = tasks.filter(task => task.status !== 'done')
  const overdue = active.filter(task => task.due_date && daysUntil(task.due_date) < 0)
  const today = active.filter(task => task.due_date && daysUntil(task.due_date) === 0)
  const thisWeek = active.filter(task => task.due_date && daysUntil(task.due_date) > 0 && daysUntil(task.due_date) <= 7)
  const later = active.filter(task => !task.due_date || daysUntil(task.due_date) > 7)

  const Group = ({ label, color, items }) => items.length > 0 && (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: color || C.muted, marginBottom: 8 }}>{label} ({items.length})</div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '4px 12px' }}>
        {items.map(task => (
          <div key={task.id} className="mz-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '11px 4px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{task.title}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                {task.due_date ? new Date(task.due_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : t('bez terminu')}
                {task.status === 'in_progress' && <span style={{ marginLeft: 8, ...pill(C.blight, C.blue) }}>{t('w trakcie')}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {task.status === 'todo' && <button onClick={() => setStatus(task, 'in_progress')} style={{ fontSize: 10, fontWeight: 700, padding: '5px 11px', borderRadius: 6, border: `1px solid ${C.bmid}`, color: C.blue, background: '#fff', cursor: 'pointer' }}>{t("▶ Rozpocznij")}</button>}
              {task.status === 'in_progress' && <button onClick={() => setStatus(task, 'done')} style={{ fontSize: 10, fontWeight: 700, padding: '5px 11px', borderRadius: 6, border: '1px solid #BBF7D0', color: C.green, background: '#fff', cursor: 'pointer' }}>{t("✓ Zakończ")}</button>}
            </div>
          </div>
        ))}
      </div>
      <style>{`.mz-row:last-child { border-bottom: none; } .mz-row:hover { background: ${C.bg}; }`}</style>
    </div>
  )

  return (
    <div>
      <PageHeader title={t("✅ Moje zadania")} subtitle={t("Wszystkie Twoje zadania, pogrupowane wg terminu")} />
      {showAllTasks && <AllTasksPanel onClose={() => setShowAllTasks(false)} profiles={profiles} currentUserId={profile?.id} />}
      <div style={{ padding: '16px 22px', maxWidth: 800 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div onClick={() => navigate('/')} style={{ fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            ← {t("Powrót do Dashboardu")}
          </div>
          {isZarzad && <span onClick={() => setShowAllTasks(true)} style={{ fontSize: 11.5, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{t("📋 Wszystkie zadania (zarząd)")}</span>}
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
          {!showAdd ? (
            <span onClick={() => setShowAdd(true)} style={{ fontSize: 11.5, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{t("+ Dodaj nowe zadanie")}</span>
          ) : (
            <div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Treść zadania…")}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 7 }}>
                <select value={assignee || ''} onChange={e => setAssignee(e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 8px', fontSize: 11 }}>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.id === profile.id ? `${p.full_name} (ja)` : p.full_name}</option>)}
                </select>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 8px', fontSize: 11 }} />
                <button onClick={handleAdd} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{saving ? t("Zapisywanie…") : t("Dodaj")}</button>
                <button onClick={() => setShowAdd(false)} style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t("Anuluj")}</button>
              </div>
            </div>
          )}
        </div>

        {loading && <div style={{ fontSize: 12, color: C.muted }}>{t("Ładowanie…")}</div>}
        {!loading && active.length === 0 && <EmptyState icon="✅" title={t("Brak aktywnych zadań")} subtitle={t("Wszystko odhaczone — możesz dodać nowe zadanie.")} />}

        {!loading && (
          <>
            <Group label={'🔴 ' + t('Zaległe')} color={C.red} items={overdue} />
            <Group label={t('Dziś')} items={today} />
            <Group label={t('Ten tydzień')} items={thisWeek} />
            <Group label={t('Później')} items={later} />
          </>
        )}
      </div>
    </div>
  );
}
