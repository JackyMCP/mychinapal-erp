import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { avatarColor, initials } from '../components/klienci/utils'
import ProjectTile from '../components/projekty/ProjectTile'
import ProfitTable from '../components/projekty/ProfitTable'
import RealCostsTable from '../components/projekty/RealCostsTable'
import ProjectTeam from '../components/projekty/ProjectTeam'
import StageTimeline from '../components/projekty/StageTimeline'
import ProjectFiles from '../components/projekty/ProjectFiles'
import ProjectChat from '../components/projekty/ProjectChat'
import { computeStageProgress } from '../components/projekty/stageDefs'
import { useUI } from '../lib/ui'
import EmptyState from '../components/ui/EmptyState'
import NewProjectModal from '../components/projekty/NewProjectModal'

export default function Projekty() {
  const {
    t
  } = useLang();
  const { toast, confirm } = useUI()

  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [marzaByProject, setMarzaByProject] = useState({})
  const [documents, setDocuments] = useState([])
  const [quotes, setQuotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    const [prRes, clRes, mzRes, docRes, quotesRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name'),
      supabase.from('v_marza_zlecenie').select('*'),
      supabase.from('documents').select('*'),
      supabase.from('quotes').select('project_id, status'),
    ])
    setProjects(prRes.data || [])
    setClients(clRes.data || [])
    setMarzaByProject(Object.fromEntries((mzRes.data || []).map(m => [m.project_id, m])))
    setDocuments(docRes.data || [])
    setQuotes(quotesRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    const wanted = searchParams.get('project')
    if (wanted) setSelectedId(wanted)
  }, [])

  const clientNameById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c.name])), [clients])

  const docsByProject = useMemo(() => {
    const map = {}
    for (const d of documents) {
      if (!d.project_id) continue
      if (!map[d.project_id]) map[d.project_id] = []
      map[d.project_id].push(d)
    }
    return map
  }, [documents])

  const quotesByProject = useMemo(() => {
    const map = {}
    for (const q of quotes) {
      if (!q.project_id) continue
      if (!map[q.project_id]) map[q.project_id] = []
      map[q.project_id].push(q)
    }
    return map
  }, [quotes])

  const progressByProject = useMemo(() => {
    const map = {}
    for (const p of projects) map[p.id] = computeStageProgress(docsByProject[p.id] || [], quotesByProject[p.id] || [])
    return map
  }, [projects, docsByProject, quotesByProject])

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const name = clientNameById[p.client_id] || ''
      const matchesSearch = !search || p.order_label.toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase())
      if (!matchesSearch) return false
      const prog = progressByProject[p.id]
      if (filter === 'done') return prog.currentIndex === null
      if (filter === 'progress') return prog.currentIndex !== null
      return true
    })
  }, [projects, search, filter, clientNameById, progressByProject])

  const selected = projects.find(p => p.id === selectedId) || null

  const handleSelect = (p) => { setSelectedId(p.id); setSearchParams({ project: p.id }) }
  const handleBack = () => { setSelectedId(null); setSearchParams({}) }

  const handleAssignClient = async (project, newClientId) => {
    const { error } = await supabase.from('projects').update({ client_id: newClientId, updated_at: new Date().toISOString() }).eq('id', project.id)
    if (error) { toast.error('Nie udało się zaktualizować powiązania: ' + error.message); return }
    await loadAll()
  }

  const handleProjectCreated = async (created) => {
    setShowNewProject(false)
    await loadAll()
    handleSelect(created)
  }

  if (selected) {
    const progress = progressByProject[selected.id] || computeStageProgress([])
    const clientName = clientNameById[selected.client_id] || 'Nieznany klient'
    const projectDocs = docsByProject[selected.id] || []
    return (
      <div>
        <PageHeader title={selected.order_label} subtitle={clientName} />
        <div style={{ padding: '16px 22px', maxWidth: 1100 }}>
          <div onClick={handleBack} style={{ fontSize: 11, fontWeight: 600, color: C.blue, cursor: 'pointer', marginBottom: 14 }}>{t("← Wróć do listy projektów")}</div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
              <svg width="60" height="60"><circle cx="30" cy="30" r="25" fill="none" stroke={C.border} strokeWidth="6" /><circle cx="30" cy="30" r="25" fill="none" stroke={C.blue} strokeWidth="6" strokeDasharray={157} strokeDashoffset={157 - (157 * progress.progressPct / 100)} strokeLinecap="round" transform="rotate(-90 30 30)" /></svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800 }}>{progress.doneStages.size}/9</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: avatarColor(clientName) }}>{initials(clientName)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>{selected.order_label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{clientName} {t("· utworzono")} {selected.created_at ? new Date(selected.created_at).toLocaleDateString('pl-PL') : '—'}</div>
            </div>
          </div>

          <ProjectTeam project={selected} currentUserId={profile?.id} />
          <ProfitTable project={selected} onSaved={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))} />
          <RealCostsTable project={selected} onSaved={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))} />

          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', margin: '4px 0 10px' }}>{t("Etapy zamówienia")}</div>
          <StageTimeline project={selected} documents={projectDocs} onDocumentsChanged={loadAll} />

          <ProjectFiles project={selected} documents={projectDocs} onChanged={loadAll} />

          <div style={{ marginTop: 8 }}>
            <ProjectChat project={selected} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("Projekty & Zamówienia")} subtitle={loading ? 'Ładowanie…' : `${projects.length} zamówień widocznych dla Ciebie`}
        right={<button onClick={() => setShowNewProject(true)} style={{ padding: '7px 13px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff' }}>{t("+ Nowy projekt")}</button>} />
      <div style={{ padding: '16px 22px', maxWidth: 1500 }}>
        <div onClick={() => setShowNewProject(true)} className="ux-hover-lift"
          style={{
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', marginBottom: 16, padding: '16px 18px',
            borderRadius: 14, border: `2px dashed ${C.blue}`, background: `linear-gradient(120deg, ${C.blight}, #fff)`,
          }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: '0 2px 8px rgba(37,99,235,.15)', color: C.blue, fontWeight: 800 }}>+</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: C.blue }}>{t("Dodaj nowe zamówienie / projekt")}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{t("Nazwa i klient — szacowany zysk i etapy uzupełnisz zaraz po utworzeniu.")}</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.blue, borderRadius: 8, padding: '7px 14px', whiteSpace: 'nowrap' }}>{t("+ Nowy projekt")}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj zamówienia, klienta…")}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 12, maxWidth: 260, flex: 1 }} />
          {[['all', 'Wszystkie'], ['progress', 'W toku'], ['done', 'Zakończone']].map(([key, label]) => (
            <div key={key} onClick={() => setFilter(key)}
              style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filter === key ? C.navy : '#fff', color: filter === key ? '#fff' : C.text2, borderColor: filter === key ? C.navy : C.border }}>
              {t(label)}
            </div>
          ))}
        </div>

        {filtered.length === 0 && !loading && <EmptyState icon="📦" title={t("Brak zamówień")} subtitle={t("Nie znaleziono zamówień spełniających kryteria wyszukiwania.")} />}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(p => (
            <ProjectTile key={p.id} project={p} clientName={clientNameById[p.client_id] || 'Nieznany klient'}
              progress={progressByProject[p.id]} marza={marzaByProject[p.id]} onClick={() => handleSelect(p)}
              clients={clients} onAssignClient={handleAssignClient} />
          ))}
        </div>
      </div>
      {showNewProject && <NewProjectModal clients={clients} onClose={() => setShowNewProject(false)} onCreated={handleProjectCreated} />}
    </div>
  );
}
