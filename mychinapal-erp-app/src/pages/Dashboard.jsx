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
import DashboardWidgetSettings from '../components/dashboard/DashboardWidgetSettings'
import { loadDashboardLayout, saveDashboardLayout } from '../lib/dashboardLayout'
import { widgetsForRole, defaultLayout } from '../lib/dashboardWidgets'

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
  const [layout, setLayout] = useState(defaultLayout())
  const [showSettings, setShowSettings] = useState(false)
  const [editLayout, setEditLayout] = useState([])
  const [savingLayout, setSavingLayout] = useState(false)

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
      const [{ data: docsData }, { data: quotesData }] = await Promise.all([
        supabase.from('documents').select('project_id, category').eq('visible_in_files', true).in('project_id', myActiveProjects.map(p => p.id)),
        supabase.from('quotes').select('project_id, status').in('project_id', myActiveProjects.map(p => p.id)),
      ])
      const docsByProject = {}
      for (const d of (docsData || [])) {
        if (!d.project_id) continue
        if (!docsByProject[d.project_id]) docsByProject[d.project_id] = []
        docsByProject[d.project_id].push(d)
      }
      const quotesByProject = {}
      for (const q of (quotesData || [])) {
        if (!q.project_id) continue
        if (!quotesByProject[q.project_id]) quotesByProject[q.project_id] = []
        quotesByProject[q.project_id].push(q)
      }
      const stages = {}
      for (const p of myActiveProjects) {
        const { currentIndex, progressPct } = computeStageProgress(docsByProject[p.id] || [], quotesByProject[p.id] || [])
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

  useEffect(() => {
    if (!profile?.id) return
    loadDashboardLayout(profile.id).then(setLayout)
  }, [profile?.id])

  const clientNameById = Object.fromEntries(clients.map(c => [c.id, c.name]))

  const openSettings = () => { setEditLayout(layout); setShowSettings(true) }
  const closeSettings = () => setShowSettings(false)
  const handleSaveLayout = async () => {
    setSavingLayout(true)
    const { error } = await saveDashboardLayout(profile.id, editLayout)
    setSavingLayout(false)
    if (!error) { setLayout(editLayout); setShowSettings(false) }
  }

  // Każdy widget renderowany na pełną szerokość, w kolejności wybranej przez
  // użytkownika (patrz DashboardWidgetSettings.jsx) — dwa widgety, które z
  // natury występują w parze (Moje projekty/Moje zadania obok siebie,
  // Wpływy/Wypływy obok siebie), zachowują swój wewnętrzny układ 2-kolumnowy,
  // ale jako JEDNA pozycja na liście do przestawiania.
  const widgetRenderers = {
    worldclocks: () => <WorldClocks />,
    companydirection: () => <CompanyDirection currentUserId={profile?.id} />,
    moneygames: () => txSum && (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 9 }}>
        <GoldOreReveal value={txSum.wpływy} label={t("Wpływy (WN+)")} />
        <CoinSackReveal value={txSum.wypływy} label={t("Wypływy (MA-)")} />
      </div>
    ),
    whoami: () => <WhoAmI profile={profile} isZarzad={isZarzad} />,
    myprojects: () => (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <MyProjects projects={myProjects} clientNameById={clientNameById} stageByProject={stageByProject} />
        <MyTasks tasks={tasks} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} isZarzad={isZarzad} />
      </div>
    ),
    mytasks: null, // renderowane razem z myprojects (patrz wyżej) — para 2-kolumnowa
    calendar: () => <CalendarWidget events={events} profiles={profiles} currentUserId={profile?.id} onChanged={loadDashboard} />,
    chatogolny: () => <TeamChat channelName="Czat Ogólny" zarzadOnly={false} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.blue} />,
    chatzarzadu: () => <TeamChat channelName="Czat Zarządu" zarzadOnly={true} currentUserId={profile?.id} currentUserName={profile?.full_name} accentColor={C.purple} />,
  }

  const visible = widgetsForRole(layout, isZarzad).filter(e => e.visible)
  // "mytasks" nie renderuje się osobno (żyje wewnątrz "myprojects"), więc
  // jeśli ktoś ukryje samo "Moje projekty" ale zostawi "Moje zadania"
  // widoczne, i tak pokazujemy parę — inaczej zadania by zniknęły bez sensu.
  const shownIds = new Set(visible.map(e => e.id))
  if (shownIds.has('mytasks') && !shownIds.has('myprojects')) shownIds.add('myprojects')
  const orderedIds = layout.map(e => e.id).filter(id => shownIds.has(id) && id !== 'mytasks')
  // widgety spoza zapisanego layoutu (np. nowo dodane) i tak trafiły tu przez
  // widgetsForRole/normalizeLayout, więc orderedIds już je zawiera

  return (
    <div>
      <PageHeader title={t("Dashboard")} subtitle={loading ? t('Ładowanie…') : t('Twój panel sterowania MyChinaPal')}
        right={(
          <button onClick={openSettings} style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t('⚙️ Dostosuj widgety')}
          </button>
        )} />
      <div style={{ padding: '16px 22px', maxWidth: 1400 }}>
        {orderedIds.map(id => {
          const render = widgetRenderers[id]
          if (!render) return null
          const node = render()
          if (!node) return null
          return <div key={id} style={{ marginBottom: 14 }}>{node}</div>
        })}
      </div>

      {showSettings && (
        <DashboardWidgetSettings layout={editLayout} isZarzad={isZarzad} onChange={setEditLayout}
          onClose={closeSettings} onSave={handleSaveLayout} saving={savingLayout} />
      )}
    </div>
  );
}
