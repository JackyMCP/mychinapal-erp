import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

function dueLabel(due, t) {
  if (!due) return null
  const days = Math.ceil((new Date(due) - new Date(new Date().toDateString())) / 86400000)
  if (days < 0) return { text: `⚠ ${Math.abs(days)} ${t('dni po terminie')}`, color: C.red, bg: C.rlight }
  if (days === 0) return { text: t('termin: dziś'), color: C.orange, bg: C.olight }
  return { text: `${t('termin')}: ${new Date(due).toLocaleDateString('pl-PL')}`, color: C.muted, bg: C.bg }
}

export default function TabZadania({ tasks, profiles, currentUserId, clientId, onChanged }) {
  const { t } = useLang()
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(currentUserId)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(), client_id: clientId, assigned_to: assignee || currentUserId, assigned_by: currentUserId,
      due_date: dueDate || null, status: 'todo',
    })
    setSaving(false)
    if (error) { alert('Nie udało się dodać zadania: ' + error.message); return }
    setTitle(''); setDueDate(''); setShowAdd(false)
    onChanged && onChanged()
  }

  const toggleDone = async (task) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    const patch = { status: nextStatus, completed_at: nextStatus === 'done' ? new Date().toISOString() : null }
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (error) { alert('Nie udało się zaktualizować zadania: ' + error.message); return }
    onChanged && onChanged()
  }

  const active = [...tasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    return (a.due_date || '9999').localeCompare(b.due_date || '9999')
  })

  const assigneeName = (id) => profiles.find(p => p.id === id)?.full_name || t('—')

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>✅ {t("Zadania dotyczące tego klienta")}</div>
        <span onClick={() => setShowAdd(s => !s)} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{showAdd ? t("✕ Anuluj") : t("+ Nowe zadanie")}</span>
      </div>

      {showAdd && (
        <div style={{ background: C.bg, borderRadius: 9, padding: 10, marginBottom: 12 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Treść zadania…")}
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 11.5, marginBottom: 7, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 7 }}>
            <select value={assignee || ''} onChange={e => setAssignee(e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentUserId ? `${p.full_name} (${t('ja')})` : p.full_name}</option>)}
            </select>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
            <button onClick={handleAdd} disabled={saving} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{t("Dodaj")}</button>
          </div>
        </div>
      )}

      {active.length === 0 && !showAdd && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak zadań dla tego klienta.")}</div>}
      {active.map(task => {
        const due = task.status !== 'done' ? dueLabel(task.due_date, t) : null
        return (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: `1px solid ${C.border}` }}>
            <div onClick={() => toggleDone(task)} style={{
              width: 19, height: 19, borderRadius: 6, border: `2px solid ${task.status === 'done' ? C.green : C.border}`, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', background: task.status === 'done' ? C.green : 'transparent', transition: '.15s',
            }}>{task.status === 'done' ? '✓' : ''}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? C.muted : C.text }}>{t(task.title)}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {task.status === 'done' ? `${t('zakończone')} ${task.completed_at ? new Date(task.completed_at).toLocaleDateString('pl-PL') : ''}` : assigneeName(task.assigned_to)}
              </div>
            </div>
            {due && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: due.bg, color: due.color, whiteSpace: 'nowrap' }}>{due.text}</span>}
          </div>
        )
      })}
    </div>
  )
}
