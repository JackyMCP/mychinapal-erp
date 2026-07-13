import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'
import { useUI } from '../../lib/ui'

export default function ProjectTeam({ project, currentUserId }) {
  const {
    t
  } = useLang();
  const { toast } = useUI()

  const [profiles, setProfiles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data: pr }, { data: as }] = await Promise.all([
      supabase.from('profiles').select('id,full_name'),
      supabase.from('project_assignments').select('id,user_id,role,profiles(full_name)').eq('project_id', project.id),
    ])
    setProfiles(pr || [])
    setAssignments(as || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [project.id])

  const assignmentFor = (uid) => assignments.find(a => a.user_id === uid)
  const isAssigned = (uid) => !!assignmentFor(uid)

  const toggle = async (uid) => {
    const row = assignmentFor(uid)
    if (row) {
      const { error } = await supabase.from('project_assignments').delete().eq('id', row.id)
      if (error) { toast.error(t('Nie udało się usunąć: ') + error.message); return }
    } else {
      const { error } = await supabase.from('project_assignments').insert({ project_id: project.id, user_id: uid })
      if (error) { toast.error(t('Nie udało się przypisać: ') + error.message); return }
    }
    load()
  }

  const setMainRole = async (uid, role, e) => {
    e.stopPropagation()
    const row = assignmentFor(uid)
    if (!row) return
    if (row.role === role) {
      const { error } = await supabase.from('project_assignments').update({ role: null }).eq('id', row.id)
      if (error) { toast.error(t('Nie udało się zmienić: ') + error.message); return }
      load()
      return
    }
    const prevHolder = assignments.find(a => a.role === role && a.user_id !== uid)
    if (prevHolder) {
      const { error: e1 } = await supabase.from('project_assignments').update({ role: null }).eq('id', prevHolder.id)
      if (e1) { toast.error(t('Nie udało się zmienić: ') + e1.message); return }
    }
    const { error: e2 } = await supabase.from('project_assignments').update({ role }).eq('id', row.id)
    if (e2) { toast.error(t('Nie udało się ustawić: ') + e2.message); return }
    load()
  }

  if (loading) return null

  const mainPl = assignments.find(a => a.role === 'glowny_pl')
  const mainCn = assignments.find(a => a.role === 'glowny_cn')

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>{t("Zespół przypisany do zamówienia")}</div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
        <div><span style={{ color: C.muted }}>{t("Główny opiekun PL: ")}</span><b style={{ color: C.text }}>{mainPl?.profiles?.full_name || t("nie wybrano")}</b></div>
        <div><span style={{ color: C.muted }}>{t("Główny opiekun CN: ")}</span><b style={{ color: C.text }}>{mainCn?.profiles?.full_name || t("nie wybrano")}</b></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {profiles.map(p => {
          const row = assignmentFor(p.id)
          const assigned = !!row
          return (
            <span key={p.id} onClick={() => toggle(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, padding: '5px 6px 5px 5px', borderRadius: 20, cursor: 'pointer', background: assigned ? C.blight : C.bg, border: `1px solid ${assigned ? C.bmid : C.border}`, color: assigned ? C.blue : C.text2 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', background: avatarColor(p.full_name) }}>{initials(p.full_name)}</span>
              <span style={{ paddingRight: 3 }}>{p.full_name}{p.id === currentUserId ? t(" (ja)") : ''}</span>
              {assigned && (
                <>
                  <span onClick={(e) => setMainRole(p.id, 'glowny_pl', e)} title={t("Główny opiekun PL")}
                    style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, background: row.role === 'glowny_pl' ? C.navy : '#fff', color: row.role === 'glowny_pl' ? '#fff' : C.muted, border: `1px solid ${row.role === 'glowny_pl' ? C.navy : C.border}` }}>PL</span>
                  <span onClick={(e) => setMainRole(p.id, 'glowny_cn', e)} title={t("Główny opiekun CN")}
                    style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, background: row.role === 'glowny_cn' ? '#B91C1C' : '#fff', color: row.role === 'glowny_cn' ? '#fff' : C.muted, border: `1px solid ${row.role === 'glowny_cn' ? '#B91C1C' : C.border}` }}>CN</span>
                </>
              )}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>{t(
        "Kliknij osobę żeby dodać/usunąć z zespołu tego zamówienia — pojawi się wtedy na jej dashboardzie w \"Moje aktywne projekty\". Przy przypisanej osobie kliknij PL/CN żeby ustawić głównego opiekuna polskiego/chińskiego."
      )}</div>
    </div>
  );
}
