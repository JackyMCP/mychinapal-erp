import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

export default function CalendarWidget({ events, profiles, currentUserId, onChanged }) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [attendeeIds, setAttendeeIds] = useState([currentUserId])
  const [saving, setSaving] = useState(false)

  const cells = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const eventsByDay = useMemo(() => {
    const map = {}
    for (const e of events) {
      const key = new Date(e.start_at).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  const upcoming = useMemo(() => events
    .filter(e => new Date(e.start_at) >= new Date(today.toDateString()))
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 5), [events])

  const toggleAttendee = (id) => setAttendeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const openAddForDay = (d) => {
    setSelectedDay(d)
    setDate(d.toISOString().slice(0, 10))
    setShowAdd(true)
  }

  const handleAdd = async () => {
    if (!title.trim() || !date) return
    setSaving(true)
    const startAt = new Date(`${date}T${startTime}:00`).toISOString()
    const endAt = endTime ? new Date(`${date}T${endTime}:00`).toISOString() : null
    const { data: ev, error } = await supabase.from('calendar_events').insert({
      title: title.trim(), start_at: startAt, end_at: endAt, created_by: currentUserId,
    }).select().single()
    if (error) { setSaving(false); alert('Nie udało się dodać wydarzenia: ' + error.message); return }
    const uniqueAttendees = [...new Set([...attendeeIds, currentUserId])]
    const { error: attErr } = await supabase.from('event_attendees').insert(uniqueAttendees.map(uid => ({ event_id: ev.id, user_id: uid })))
    setSaving(false)
    if (attErr) { alert('Wydarzenie dodane, ale nie udało się przypisać uczestników: ' + attErr.message) }
    setTitle(''); setAttendeeIds([currentUserId]); setShowAdd(false)
    onChanged && onChanged()
  }

  const handleDelete = async (eventId) => {
    if (!confirm('Usunąć to wydarzenie?')) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', eventId)
    if (error) { alert('Nie udało się usunąć: ' + error.message); return }
    onChanged && onChanged()
  }

  const dayEventsSelected = selectedDay ? (eventsByDay[selectedDay.toDateString()] || []) : []

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>Kalendarz</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 12 }}>‹</span>
          <span style={{ fontSize: 11, fontWeight: 700 }}>{cursor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
          <span onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 12 }}>›</span>
          <span onClick={() => { setSelectedDay(today); setDate(today.toISOString().slice(0, 10)); setShowAdd(s => !s) }} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginLeft: 8 }}>{showAdd ? '✕' : '+ Nowe'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 14 }}>
        {DOW.map(d => <div key={d} style={{ fontSize: 9, color: C.muted, textAlign: 'center', fontWeight: 700, paddingBottom: 4 }}>{d}</div>)}
        {cells.map((d, i) => {
          const isToday = d && d.toDateString() === today.toDateString()
          const isSelected = d && selectedDay && d.toDateString() === selectedDay.toDateString()
          const dayEvents = d ? (eventsByDay[d.toDateString()] || []) : []
          return (
            <div key={i} onClick={() => d && setSelectedDay(prev => (prev && prev.toDateString() === d.toDateString() ? null : d))}
              style={{
                aspectRatio: '1', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, position: 'relative', cursor: d ? 'pointer' : 'default',
                background: isToday ? C.blue : isSelected ? C.bmid : d ? C.bg : 'transparent',
                color: isToday ? '#fff' : d ? C.text2 : 'transparent', fontWeight: isToday ? 800 : 400,
                boxShadow: isSelected && !isToday ? `0 0 0 2px ${C.blue}` : 'none',
              }}>
              {d ? d.getDate() : ''}
              {dayEvents.length > 0 && (
                <div style={{ display: 'flex', gap: 2, position: 'absolute', bottom: 4 }}>
                  {dayEvents.slice(0, 3).map((_, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: isToday ? '#fff' : C.blue }} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedDay && (
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{selectedDay.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!showAdd && <span onClick={() => openAddForDay(selectedDay)} style={{ fontSize: 10.5, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>+ Dodaj</span>}
              <span onClick={() => { setSelectedDay(null); setShowAdd(false) }} style={{ fontSize: 10.5, color: C.muted, cursor: 'pointer' }}>✕</span>
            </div>
          </div>

          {!showAdd && dayEventsSelected.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>Brak wydarzeń tego dnia.</div>}
          {!showAdd && dayEventsSelected.map(e => (
            <div key={e.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                    {new Date(e.start_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    {e.end_at ? ` – ${new Date(e.end_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                </div>
                {(e.created_by === currentUserId) && <span onClick={() => handleDelete(e.id)} style={{ fontSize: 10, color: C.red, cursor: 'pointer' }}>Usuń</span>}
              </div>
              <div style={{ display: 'flex', marginTop: 7 }}>
                {(e.event_attendees || []).map((a, j) => (
                  <div key={j} title={a.profiles?.full_name} style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', border: '2px solid #fff', marginLeft: j > 0 ? -6 : 0, background: avatarColor(a.profiles?.full_name || '') }}>
                    {initials(a.profiles?.full_name || '?')}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {showAdd && (
            <div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nazwa spotkania…"
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 11.5, marginBottom: 7, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 10.5 }} />
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Uczestnicy</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {profiles.map(p => (
                  <span key={p.id} onClick={() => toggleAttendee(p.id)}
                    style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: attendeeIds.includes(p.id) ? C.blue : C.white, color: attendeeIds.includes(p.id) ? '#fff' : C.text2, border: `1px solid ${attendeeIds.includes(p.id) ? C.blue : C.border}` }}>
                    {p.full_name}
                  </span>
                ))}
              </div>
              <button onClick={handleAdd} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Zapisywanie…' : 'Zapisz spotkanie'}</button>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Nadchodzące</div>
      {upcoming.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>Brak nadchodzących wydarzeń.</div>}
      {upcoming.map(e => (
        <div key={e.id} onClick={() => setSelectedDay(new Date(e.start_at))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{e.title}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{new Date(e.start_at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div style={{ display: 'flex' }}>
            {(e.event_attendees || []).slice(0, 4).map((a, j) => (
              <div key={j} title={a.profiles?.full_name} style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', border: '2px solid #fff', marginLeft: j > 0 ? -6 : 0, background: avatarColor(a.profiles?.full_name || '') }}>
                {initials(a.profiles?.full_name || '?')}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
