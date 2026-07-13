import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import CountUp from '../components/ui/CountUp'
import WhoAmI from '../components/dashboard/WhoAmI'
import MyProjects from '../components/dashboard/MyProjects'
import MyTasks from '../components/dashboard/MyTasks'
import CalendarWidget from '../components/dashboard/CalendarWidget'
import CompanyDirection from '../components/dashboard/CompanyDirection'
import TeamChat from '../components/dashboard/TeamChat'

export default function Dashboard() {
  const {
    t
  } = useLang();

  const { profile, isZarzad } = useAuth()
  const [clients, setClients] = useState([])
  const [myProjects, setMyProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState([])
  const [txSum, setTxSum] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadDashboard = async () => {
    if (!profile) return
    setLoading(true)
    const [clientsRes, myAssignRes, tasksRes, profilesRes, eventsRes] = await Promise.all([
      supabase.from('clients').select('id,name'),
      supabase.from('project_assignments').select('projects(*)').eq('user_id', profile.id),
      supabase.from('tasks').select('*').eq('assigned_to', profile.id),
      supabase.from('profiles').select('id,full_name'),
      supabase.from('calendar_events').select('*, event_attendees(user_id, profiles(full_name))').order('start_at'),
    ])
    setClients(clientsRes.data || [])
    setMyProjects((myAssignRes.data || []).map(r => r.projects).filter(Boolean).filter(p => p.active))
    setTasks(tasksRes.data || [])
    setProfiles(profilesRes.data || [])
    setEvents(eventsRes.data || [])

    if (isZarzad) {
      const { data: kkData } = await supabase.from('v_kontrola_kasy').select('row_label, value').eq('quarter', 'razem')
      if (kkData) {
        const wpływy = Number(kkData.find(r => r.row_label === 'wpływy (WN+)')?.value) || 0
        const wypływy = Number(kkData.find(r => r.row_label === 'wypływy (MA-)')?.value) || 0
        setTxSum({ wpływy, wypływy })
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadDashboard() }, [profile?.id])

  const clientNameById = Object.fromEntries(clients.map(c => [c.id, c.name]))

  return (
    <div>
      <PageHeader title={t("Dashboard")} subtitle={loading ? 'Ładowanie…' : `${t("Witaj")}, ${(profile?.full_name || '').trim().split(/\s+/)[0] || ''} 👋`} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>

        {isZarzad && <div style={{ marginBottom: 14 }}><CompanyDirection currentUserId={profile?.id} /></div>}

        {isZarzad && txSum && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
            <div style={{ background: C.navy, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>{t("Wpływy (WN+)")}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 }}><CountUp value={Math.round(txSum.wpływy)} /> {t("PLN")}</div>
            </div>
            <div style={{ background: C.navy2, borderRadius: 9, padding: '12px 14px', color: '#fff' }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>{t("Wypływy (MA-)")}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 }}><CountUp value={Math.round(txSum.wypływy)} /> {t("PLN")}</div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}><WhoAmI profile={profile} isZarzad={isZarzad} /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <MyProjects projects={myProjects} clientNameById={clientNameById} />
          <MyTasks tasks={tasks} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <CalendarWidget events={events} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isZarzad ? '1fr 1fr' : '1fr', gap: 14 }}>
          <TeamChat channelName="Czat Ogólny" zarzadOnly={false} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.blue} />
          {isZarzad && <TeamChat channelName="Czat Zarządu" zarzadOnly={true} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.purple} />}
        </div>
      </div>
    </div>
  );
}
