import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import EmptyState from '../ui/EmptyState'
import { useNavigate } from 'react-router-dom'
import AllTasksPanel from './AllTasksPanel'
import { taskTargetPath } from '../../lib/taskLinks'

const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })

function dueLabel(due) {
  if (!due) return null
  const days = Math.ceil((new Date(due) - new Date(new Date().toDateString())) / 86400000)
  if (days < 0) return { text: `⚠ ${Math.abs(days)} dni po terminie`, cls: 'overdue' }
  if (days === 0) return { text: 'termin: dziś', cls: 'today' }
  return { text: `termin: ${new Date(due).toLocaleDateString('pl-PL')}`, cls: 'ok' }
}

export default function MyTasks({ tasks, profiles, currentUserId, onChanged, isZarzad }) {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()
  const navigate = useNavigate()

  const [showAdd, setShowAdd] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(currentUserId)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(), assigned_to: assignee, assigned_by: currentUserId,
      due_date: dueDate || null, status: 'todo',
    })
    setSaving(false)
    if (error) { toast.error('Nie udało się dodać zadania: ' + error.message); return }
    setTitle(''); setDueDate(''); setShowAdd(false)
    onChanged && onChanged()
  }

  const setStatus = async (task, status) => {
    const patch = { status }
    if (status === 'in_progress') patch.started_at = new Date().toISOString()
    if (status === 'done') patch.completed_at = new Date().toISOString()
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (error) { toast.error('Nie udało się zaktualizować zadania: ' + error.message); return }
    onChanged && onChanged()
  }

  const active = tasks.filter(task => task.status !== 'done').sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>{t("Moje zadania (")}{active.length})</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isZarzad && <span onClick={() => setShowAllTasks(true)} style={{ fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>{t("📋 Wszystkie zadania")}</span>}
          <span onClick={() => setShowAdd(s => !s)} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{showAdd ? t("✕ Anuluj") : t("+ Nowe")}</span>
        </div>
      </div>
      {showAllTasks && <AllTasksPanel onClose={() => setShowAllTasks(false)} profiles={profiles} currentUserId={currentUserId} />}
      {showAdd && (
        <div style={{ background: C.bg, borderRadius: 9, padding: 10, marginBottom: 12 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Treść zadania…")}
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 11.5, marginBottom: 7, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 7 }}>
            <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentUserId ? `${p.full_name} (ja)` : p.full_name}</option>)}
            </select>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
            <button onClick={handleAdd} disabled={saving} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{t("Dodaj")}</button>
          </div>
        </div>
      )}
      {active.length === 0 && !showAdd && <EmptyState icon="✅" title={t("Brak aktywnych zadań")} subtitle={t("Wszystko odhaczone — możesz dodać nowe zadanie.")} />}
      {active.map(task => {
        const due = dueLabel(task.due_date)
        const link = taskTargetPath(task)
        return (
          <div key={task.id} className="mytask-row" onClick={() => link && navigate(link)}
            title={link ? t('Kliknij, żeby przejść do powiązanej wyceny/faktury/zamówienia/klienta') : undefined}
            style={{ padding: '9px 6px', borderRadius: 9, borderBottom: `1px solid ${C.border}`, transition: 'background .15s ease', cursor: link ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{t(task.title)}{link && <span style={{ color: C.blue, marginLeft: 6 }}>↗</span>}</div>
              {due && <span style={pill(due.cls === 'overdue' ? C.rlight : due.cls === 'today' ? C.olight : C.bg, due.cls === 'overdue' ? C.red : due.cls === 'today' ? C.orange : C.muted)}>{t(due.text)}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              {task.status === 'todo' && <button onClick={(e) => { e.stopPropagation(); setStatus(task, 'in_progress') }} className="mytask-btn" style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.bmid}`, color: C.blue, background: '#fff', cursor: 'pointer', transition: 'transform .15s ease, box-shadow .15s ease' }}>{t("▶ Rozpocznij")}</button>}
              {task.status === 'in_progress' && <button onClick={(e) => { e.stopPropagation(); setStatus(task, 'done') }} className="mytask-btn" style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #BBF7D0', color: C.green, background: '#fff', cursor: 'pointer', transition: 'transform .15s ease, box-shadow .15s ease' }}>{t("✓ Zakończ")}</button>}
              {task.status === 'in_progress' && <span style={pill(C.blight, C.blue)}>{t("w trakcie")}</span>}
            </div>
          </div>
        );
      })}
      {tasks.length > 0 && (
        <a onClick={() => navigate('/moje-zadania')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginTop: 10 }}>
          {t("Zobacz więcej")} →
        </a>
      )}
      <style>{`
        .mytask-row:hover { background: ${C.bg}; padding-left: 10px; }
        .mytask-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(37,99,235,.18); }
      `}</style>
    </div>
  );
}
