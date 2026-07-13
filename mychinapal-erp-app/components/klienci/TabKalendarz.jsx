import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { useUI } from '../../lib/ui'

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']

function toDateKey(d) { return d.toISOString().slice(0, 10) }

function eventColor(task) {
  if (task.status === 'done') return C.green
  if (task.priority === 'pilne') return C.red
  return C.blue
}

export default function TabKalendarz({ tasks, clientId, onChanged }) {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const withDue = tasks.filter(tk => tk.due_date)
  const initialMonth = withDue.length > 0 ? new Date(withDue[0].due_date) : new Date()
  const [viewDate, setViewDate] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const tk of withDue) {
      const key = tk.due_date
      if (!map[key]) map[key] = []
      map[key].push(tk)
    }
    return map
  }, [tasks])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadBlank = (firstOfMonth.getDay() + 6) % 7 // Pn=0

  const cells = []
  for (let i = 0; i < leadBlank; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const handleAdd = async () => {
    if (!title.trim() || !dueDate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(), client_id: clientId, due_date: dueDate, status: 'todo',
      assigned_to: user?.id, assigned_by: user?.id,
    })
    setSaving(false)
    if (error) { toast.error('Nie udało się dodać zadania: ' + error.message); return }
    setTitle(''); setDueDate(''); setShowAdd(false)
    onChanged && onChanged()
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>📅 {t("Terminy i etapy zamówień tego klienta")}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 14, padding: '2px 8px' }}>‹</span>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{t(MONTHS[month])} {year}</div>
          <span onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 14, padding: '2px 8px' }}>›</span>
          <span onClick={() => setShowAdd(s => !s)} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginLeft: 6 }}>{showAdd ? t("✕ Anuluj") : t("+ Nowy termin")}</span>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: C.bg, borderRadius: 9, padding: 10, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Treść zadania / terminu…")}
            style={{ flex: 1, minWidth: 180, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 11.5 }} />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
          <button onClick={handleAdd} disabled={saving} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{t("Dodaj")}</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 9.5, color: C.muted, textAlign: 'center', fontWeight: 700, paddingBottom: 6, textTransform: 'uppercase' }}>{t(w)}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginTop: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} style={{ minHeight: 74 }} />
          const key = toDateKey(new Date(year, month, d))
          const dayEvents = eventsByDay[key] || []
          const isToday = key === toDateKey(new Date())
          return (
            <div key={i} style={{
              minHeight: 74, borderRadius: 9, background: dayEvents.length > 0 ? C.blight : C.bg, padding: 6, fontSize: 10.5, color: C.text2,
              border: isToday ? `1.5px solid ${C.blue}` : '1px solid transparent',
            }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>{d}</div>
              {dayEvents.slice(0, 2).map(tk => (
                <div key={tk.id} title={tk.title} style={{
                  marginTop: 4, fontSize: 8.5, fontWeight: 700, padding: '2px 5px', borderRadius: 5, color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: eventColor(tk),
                }}>{tk.title}</div>
              ))}
              {dayEvents.length > 2 && <div style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>+{dayEvents.length - 2} {t("więcej")}</div>}
            </div>
          )
        })}
      </div>
      {withDue.length === 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 14 }}>{t("Brak zadań z terminem dla tego klienta — dodaj pierwsze powyżej.")}</div>}
    </div>
  )
}
