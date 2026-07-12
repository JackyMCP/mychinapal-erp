import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

export default function ProjectTeam({ project, currentUserId }) {
  const [profiles, setProfiles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data: pr }, { data: as }] = await Promise.all([
      supabase.from('profiles').select('id,full_name'),
      supabase.from('project_assignments').select('id,user_id,profiles(full_name)').eq('project_id', project.id),
    ])
    setProfiles(pr || [])
    setAssignments(as || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [project.id])

  const isAssigned = (uid) => assignments.some(a => a.user_id === uid)

  const toggle = async (uid) => {
    if (isAssigned(uid)) {
      const row = assignments.find(a => a.user_id === uid)
      const { error } = await supabase.from('project_assignments').delete().eq('id', row.id)
      if (error) { alert('Nie udało się usunąć: ' + error.message); return }
    } else {
      const { error } = await supabase.from('project_assignments').insert({ project_id: project.id, user_id: uid })
      if (error) { alert('Nie udało się przypisać: ' + error.message); return }
    }
    load()
  }

  if (loading) return null

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>Zespół przypisany do zamówienia</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {profiles.map(p => {
          const assigned = isAssigned(p.id)
          return (
            <span key={p.id} onClick={() => toggle(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, padding: '5px 11px 5px 5px', borderRadius: 20, cursor: 'pointer', background: assigned ? C.blight : C.bg, border: `1px solid ${assigned ? C.bmid : C.border}`, color: assigned ? C.blue : C.text2 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', background: avatarColor(p.full_name) }}>{initials(p.full_name)}</span>
              {p.full_name}{p.id === currentUserId ? ' (ja)' : ''}
            </span>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>Kliknij osobę żeby dodać/usunąć z zespołu tego zamówienia — pojawi się wtedy na jej dashboardzie w "Moje aktywne projekty".</div>
    </div>
  )
}
