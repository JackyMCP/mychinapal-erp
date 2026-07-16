import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'
import EmptyState from '../ui/EmptyState'
import { taskTargetPath } from '../../lib/taskLinks'

const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })

function dueLabel(due) {
  if (!due) return null
  const days = Math.ceil((new Date(due) - new Date(new Date().toDateString())) / 86400000)
  if (days < 0) return { text: `⚠ ${Math.abs(days)} dni po terminie`, cls: 'overdue' }
  if (days === 0) return { text: 'termin: dziś', cls: 'today' }
  return { text: `termin: ${new Date(due).toLocaleDateString('pl-PL')}`, cls: 'ok' }
}

const STATUS_LABEL = { todo: 'Do zrobienia', in_progress: 'W trakcie', done: 'Zakończone' }

// Panel widoczny TYLKO dla zarządu (kontrola dostępu odbywa się w miejscu
// wywołania — MyTasks.jsx / MojeZadania.jsx renderują ten komponent wyłącznie
// gdy isZarzad === true). RLS na tabeli `tasks` i tak dodatkowo pilnuje tego
// samego po stronie bazy (polityka tasks_select uwzględnia is_zarzad()),
// więc pracownik nie zobaczy cudzych zadań nawet gdyby ominął UI.
export default function AllTasksPanel({ onClose, profiles, currentUserId }) {
  const { t } = useLang()
  const { toast } = useUI()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')

  const nameById = Object.fromEntries(profiles.map(p => [p.id, p.full_name]))

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('tasks').select('*')
    if (error) { toast.error('Nie udało się pobrać zadań: ' + error.message); setLoading(false); return }
    setTasks(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setStatus = async (task, status) => {
    const patch = { status }
    if (status === 'in_progress') patch.started_at = new Date().toISOString()
    if (status === 'done') patch.completed_at = new Date().toISOString()
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (error) { toast.error('Nie udało się zaktualizować zadania: ' + error.message); return }
    load()
  }

  const reassign = async (task, newAssigneeId) => {
    if (newAssigneeId === task.assigned_to) return
    const { error } = await supabase.from('tasks').update({ assigned_to: newAssigneeId }).eq('id', task.id)
    if (error) { toast.error('Nie udało się zmienić przypisania: ' + error.message); return }
    toast.success && toast.success('Zadanie przypisane do: ' + (nameById[newAssigneeId] || '—'))
    load()
  }

  const filtered = tasks
    .filter(task => filterAssignee === 'all' || task.assigned_to === filterAssignee)
    .filter(task => {
      if (filterStatus === 'all') return true
      if (filterStatus === 'active') return task.status !== 'done'
      return task.status === filterStatus
    })
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 22, width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>{t("📋 Wszystkie zadania")}</div>
          <span onClick={onClose} style={{ fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>{t("✕ Zamknij")}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 11, flex: '1 1 160px' }}>
            <option value="all">{t("Wszyscy pracownicy")}</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentUserId ? `${p.full_name} (ja)` : p.full_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 11, flex: '1 1 140px' }}>
            <option value="active">{t("Aktywne")}</option>
            <option value="todo">{t("Do zrobienia")}</option>
            <option value="in_progress">{t("W trakcie")}</option>
            <option value="done">{t("Zakończone")}</option>
            <option value="all">{t("Wszystkie")}</option>
          </select>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, marginRight: -6, paddingRight: 6 }}>
          {loading && <div style={{ fontSize: 12, color: C.muted }}>{t("Ładowanie…")}</div>}
          {!loading && filtered.length === 0 && <EmptyState icon="✅" title={t("Brak zadań spełniających filtr")} subtitle={t("Zmień filtry powyżej, żeby zobaczyć więcej.")} />}
          {!loading && filtered.map(task => {
            const due = dueLabel(task.due_date)
            const link = taskTargetPath(task)
            return (
              <div key={task.id} onClick={() => link && (onClose(), navigate(link))}
                title={link ? t('Kliknij, żeby przejść do powiązanej wyceny/faktury/zamówienia/klienta') : undefined}
                style={{ padding: '10px 8px', borderRadius: 9, borderBottom: `1px solid ${C.border}`, cursor: link ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{task.title}{link && <span style={{ color: C.blue, marginLeft: 6 }}>↗</span>}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {due && <span style={pill(due.cls === 'overdue' ? C.rlight : due.cls === 'today' ? C.olight : C.bg, due.cls === 'overdue' ? C.red : due.cls === 'today' ? C.orange : C.muted)}>{t(due.text)}</span>}
                    {task.status === 'done' && <span style={pill('#DCFCE7', C.green)}>{t("zakończone")}</span>}
                    {task.status === 'in_progress' && <span style={pill(C.blight, C.blue)}>{t("w trakcie")}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <select value={task.assigned_to || ''} onChange={e => reassign(task, e.target.value)}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 7px', fontSize: 10.5, color: C.text2 }}>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentUserId ? `${p.full_name} (ja)` : p.full_name}</option>)}
                  </select>
                  {task.status === 'todo' && <button onClick={() => setStatus(task, 'in_progress')} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.bmid}`, color: C.blue, background: '#fff', cursor: 'pointer' }}>{t("▶ Rozpocznij")}</button>}
                  {task.status === 'in_progress' && <button onClick={() => setStatus(task, 'done')} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #BBF7D0', color: C.green, background: '#fff', cursor: 'pointer' }}>{t("✓ Zakończ")}</button>}
                  {task.status === 'done' && <button onClick={() => setStatus(task, 'todo')} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, color: C.muted, background: '#fff', cursor: 'pointer' }}>{t("↺ Cofnij")}</button>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
