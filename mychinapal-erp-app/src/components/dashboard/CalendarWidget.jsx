import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'
import { useUI } from '../../lib/ui'

const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const EVENT_COLORS = [C.blue, C.purple, C.orange, C.green]

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
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()

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
    for (const k in map) map[k].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
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
    if (error) { setSaving(false); toast.error('Nie udało się dodać wydarzenia: ' + error.message); return }
    const uniqueAttendees = [...new Set([...attendeeIds, currentUserId])]
    const { error: attErr } = await supabase.from('event_attendees').insert(uniqueAttendees.map(uid => ({ event_id: ev.id, user_id: uid })))
    setSaving(false)
    if (attErr) { toast.error('Wydarzenie dodane, ale nie udało się przypisać uczestników: ' + attErr.message) }
    setTitle(''); setAttendeeIds([currentUserId]); setShowAdd(false)
    onChanged && onChanged()
  }

  const handleDelete = async (eventId) => {
    if (!confirm('Usunąć to wydarzenie?')) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', eventId)
    if (error) { toast.error('Nie udało się usunąć: ' + error.message); return }
    onChanged && onChanged()
  }

  const dayEventsSelected = selectedDay ? (eventsByDay[selectedDay.toDateString()] || []) : []

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>{t("Kalendarz")}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 13, padding: '2px 6px' }}>‹</span>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110, textAlign: 'center' }}>{cursor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
          <span onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} style={{ cursor: 'pointer', color: C.muted, fontSize: 13, padding: '2px 6px' }}>›</span>
          <span onClick={() => { setSelectedDay(today); setDate(today.toISOString().slice(0, 10)); setShowAdd(s => !s) }} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer', marginLeft: 6 }}>{showAdd ? '✕' : t("+ Nowe")}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 16 }}>
        {DOW.map(d => <div key={d} style={{ fontSize: 9, color: C.muted, textAlign: 'center', fontWeight: 700, paddingBottom: 4 }}>{d}</div>)}
        {cells.map((d, i) => {
          const isToday = d && d.toDateString() === today.toDateString()
          const isSelected = d && selectedDay && d.toDateString() === selectedDay.toDateString()
          const dayEvents = d ? (eventsByDay[d.toDateString()] || []) : []
          const visible = dayEvents.slice(0, 2)
          const extra = dayEvents.length - visible.length
          return (
            <div key={i} onClick={() => d && setSelectedDay(prev => (prev && prev.toDateString() === d.toDateString() ? null : d))}
              style={{
                minHeight: 68, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '6px 5px',
                fontSize: 10.5, position: 'relative', cursor: d ? 'pointer' : 'default', boxSizing: 'border-box',
                background: isToday ? C.blue : isSelected ? C.bmid : d ? C.bg : 'transparent',
                border: isSelected && !isToday ? `1.5px solid ${C.blue}` : '1.5px solid transparent',
                transform: isSelected ? 'scale(1.045)' : 'scale(1)',
                boxShadow: isSelected ? '0 8px 20px rgba(37,99,235,.18)' : 'none',
                zIndex: isSelected ? 2 : 1,
                transition: 'transform .15s ease, box-shadow .15s ease, background .15s ease',
              }}>
              <div style={{ fontWeight: isToday ? 800 : 600, color: isToday ? '#fff' : d ? C.text2 : 'transparent', fontSize: 11, marginBottom: 3 }}>{d ? d.getDate() : ''}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                {visible.map((ev, j) => (
                  <div key={j} style={{
                    fontSize: 8.5, fontWeight: 700, padding: '1.5px 5px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: isToday ? 'rgba(255,255,255,.25)' : EVENT_COLORS[j % EVENT_COLORS.length] + '1A',
                    color: isToday ? '#fff' : EVENT_COLORS[j % EVENT_COLORS.length],
                  }}>{ev.title}</div>
                ))}
                {extra > 0 && <div style={{ fontSize: 8, fontWeight: 700, color: isToday ? 'rgba(255,255,255,.8)' : C.muted }}>+{extra} {t("więcej")}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{
          background: `linear-gradient(180deg, ${C.blight}, ${C.white})`, border: `1px solid ${C.bmid}`, borderRadius: 12, padding: 16, marginBottom: 16,
          animation: 'calFadeIn .18s ease',
        }}>
          <style>{`@keyframes calFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, textTransform: 'capitalize' }}>{selectedDay.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{dayEventsSelected.length === 0 ? t("Brak wydarzeń") : `${dayEventsSelected.length} wydarzeni${dayEventsSelected.length === 1 ? 'e' : 'a'}`}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {!showAdd && <span onClick={() => openAddForDay(selectedDay)} style={{ fontSize: 11, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>{t("+ Dodaj wydarzenie")}</span>}
              <span onClick={() => { setSelectedDay(null); setShowAdd(false) }} style={{ fontSize: 13, color: C.muted, cursor: 'pointer' }}>✕</span>
            </div>
          </div>

          {!showAdd && dayEventsSelected.length === 0 && (
            <div style={{ fontSize: 11.5, color: C.muted, padding: '10px 0' }}>{t("Nic tu jeszcze nie zaplanowano — kliknij \"+ Dodaj wydarzenie\".")}</div>
          )}
          {!showAdd && dayEventsSelected.map((e, idx) => (
            <div key={e.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${EVENT_COLORS[idx % EVENT_COLORS.length]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    🕐 {new Date(e.start_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    {e.end_at ? ` – ${new Date(e.end_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                </div>
                {(e.created_by === currentUserId) && <span onClick={() => handleDelete(e.id)} style={{ fontSize: 10, color: C.red, cursor: 'pointer', fontWeight: 600 }}>{t("Usuń")}</span>}
              </div>
              {(e.event_attendees || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>{t("Uczestnicy")}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(e.event_attendees || []).map((a, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.bg, borderRadius: 20, padding: '3px 10px 3px 3px' }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7.5, fontWeight: 800, color: '#fff', background: avatarColor(a.profiles?.full_name || '') }}>
                          {initials(a.profiles?.full_name || '?')}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600 }}>{a.profiles?.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAdd && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Nazwa spotkania…")}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 8px', fontSize: 11 }} />
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 8px', fontSize: 11 }} />
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 8px', fontSize: 11 }} />
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>{t("Uczestnicy")}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {profiles.map(p => (
                  <span key={p.id} onClick={() => toggleAttendee(p.id)}
                    style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: attendeeIds.includes(p.id) ? C.blue : C.white, color: attendeeIds.includes(p.id) ? '#fff' : C.text2, border: `1px solid ${attendeeIds.includes(p.id) ? C.blue : C.border}` }}>
                    {p.full_name}
                  </span>
                ))}
              </div>
              <button onClick={handleAdd} disabled={saving} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: C.blue, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? t("Zapisywanie…") : t("Zapisz spotkanie")}</button>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>{t("Nadchodzące")}</div>
      {upcoming.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak nadchodzących wydarzeń.")}</div>}
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
  );
}
