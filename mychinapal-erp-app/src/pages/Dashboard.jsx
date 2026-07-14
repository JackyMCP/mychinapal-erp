import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import WhoAmI from '../components/dashboard/WhoAmI'
import MyProjects from '../components/dashboard/MyProjects'
import MyTasks from '../components/dashboard/MyTasks'
import CalendarWidget from '../components/dashboard/CalendarWidget'
import CompanyDirection from '../components/dashboard/CompanyDirection'
import WorldClocks from '../components/dashboard/WorldClocks'
import { computeStageProgress, STAGE_DEFS } from '../components/projekty/stageDefs'
import TeamChat from '../components/dashboard/TeamChat'
import GoldOreReveal from '../components/dashboard/GoldOreReveal'
import CoinSackReveal from '../components/dashboard/CoinSackReveal'
import useIsMobile from '../lib/useIsMobile'

export default function Dashboard() {
  const {
    t
  } = useLang();
  const isMobile = useIsMobile()

  const { profile, isZarzad } = useAuth()
  const [clients, setClients] = useState([])
  const [myProjects, setMyProjects] = useState([])
  const [stageByProject, setStageByProject] = useState({})
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
    const myActiveProjects = (myAssignRes.data || []).map(r => r.projects).filter(Boolean).filter(p => p.active)
    setMyProjects(myActiveProjects)
    setTasks(tasksRes.data || [])
    setProfiles(profilesRes.data || [])
    setEvents(eventsRes.data || [])

    // realny etap każdego projektu — liczony z faktycznie wgranych dokumentów (te same
    // reguły co w panelu Zamówienia, żeby etap na Dashboardzie zawsze zgadzał się z realnym)
    if (myActiveProjects.length > 0) {
      const { data: docsData } = await supabase.from('documents').select('project_id, category').in('project_id', myActiveProjects.map(p => p.id))
      const docsByProject = {}
      for (const d of (docsData || [])) {
        if (!d.project_id) continue
        if (!docsByProject[d.project_id]) docsByProject[d.project_id] = []
        docsByProject[d.project_id].push(d)
      }
      const stages = {}
      for (const p of myActiveProjects) {
        const { currentIndex, progressPct } = computeStageProgress(docsByProject[p.id] || [])
        const stageDef = currentIndex ? STAGE_DEFS.find(s => s.key === currentIndex) : null
        stages[p.id] = {
          label: stageDef ? stageDef.name : 'Zakończone (wszystkie etapy)',
          progressPct,
          missingCategories: stageDef ? stageDef.categories.filter(c => !(docsByProject[p.id] || []).some(d => d.category === c)) : [],
        }
      }
      setStageByProject(stages)
    } else {
      setStageByProject({})
    }

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
      <div style={{ padding: '16px 22px 0', maxWidth: 1400 }}>
        <WorldClocks />
      </div>
      <PageHeader title={t("Dashboard")} subtitle={loading ? t('Ładowanie…') : t('Twój panel sterowania MyChinaPal')} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>

        {isZarzad && <div style={{ marginBottom: 14 }}><CompanyDirection currentUserId={profile?.id} /></div>}

        {isZarzad && txSum && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 9, marginBottom: 14 }}>
            <GoldOreReveal value={txSum.wpływy} label={t("Wpływy (WN+)")} />
            <CoinSackReveal value={txSum.wypływy} label={t("Wypływy (MA-)")} />
          </div>
        )}

        <div style={{ marginBottom: 14 }}><WhoAmI profile={profile} isZarzad={isZarzad} /></div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <MyProjects projects={myProjects} clientNameById={clientNameById} stageByProject={stageByProject} />
          <MyTasks tasks={tasks} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <CalendarWidget events={events} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isZarzad ? '1fr 1fr' : '1fr'), gap: 14 }}>
          <TeamChat channelName="Czat Ogólny" zarzadOnly={false} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.blue} />
          {isZarzad && <TeamChat channelName="Czat Zarządu" zarzadOnly={true} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.purple} />}
        </div>
      </div>
    </div>
  );
}
