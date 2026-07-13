import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C } from '../lib/theme'
import { avatarColor, initials, daysSince, healthColor, TYP_LABELS } from '../components/klienci/utils'
import { computeStageProgress } from '../components/projekty/stageDefs'
import TabPrzeglad from '../components/klienci/TabPrzeglad'
import TabZamowienia from '../components/klienci/TabZamowienia'
import TabKalendarz from '../components/klienci/TabKalendarz'
import TabGaleria from '../components/klienci/TabGaleria'
import TabDokumenty from '../components/klienci/TabDokumenty'
import TabZadania from '../components/klienci/TabZadania'
import TabCzat from '../components/klienci/TabCzat'

const TABS = [
  { key: 'Przegląd', icon: '🧭' },
  { key: 'Zamówienia', icon: '📦' },
  { key: 'Kalendarz', icon: '📅' },
  { key: 'Galeria', icon: '🖼️' },
  { key: 'Dokumenty', icon: '📎' },
  { key: 'Zadania', icon: '✅' },
  { key: 'Czat', icon: '💬' },
]

export default function Klienci() {
  const { t } = useLang()
  const { profile, isZarzad } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [clients, setClients] = useState([])
  const [marzaById, setMarzaById] = useState({})
  const [activityById, setActivityById] = useState({})
  const [projects, setProjects] = useState([])
  const [marzaByProject, setMarzaByProject] = useState({})
  const [profiles, setProfiles] = useState([])

  const [documents, setDocuments] = useState([])
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])

  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('Przegląd')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    const [clRes, mzRes, actRes, prRes, mzpRes, profRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('v_marza_klient').select('*'),
      supabase.from('v_client_activity').select('*'),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('v_marza_zlecenie').select('*'),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    if (clRes.error) console.error(clRes.error)
    setClients(clRes.data || [])
    setMarzaById(Object.fromEntries((mzRes.data || []).map(m => [m.client_id, m])))
    setActivityById(Object.fromEntries((actRes.data || []).map(a => [a.client_id, a])))
    setProjects(prRes.data || [])
    setMarzaByProject(Object.fromEntries((mzpRes.data || []).map(m => [m.project_id, m])))
    setProfiles(profRes.data || [])
    setLoading(false)
  }

  const reloadProjects = async () => {
    const [prRes, mzpRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('v_marza_zlecenie').select('*'),
    ])
    setProjects(prRes.data || [])
    setMarzaByProject(Object.fromEntries((mzpRes.data || []).map(m => [m.project_id, m])))
  }

  const reloadDetail = async (id) => {
    const cid = id || selectedId
    if (!cid) { setDocuments([]); setContacts([]); setTasks([]); return }
    const [docRes, contactRes, taskRes] = await Promise.all([
      supabase.from('documents').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
      supabase.from('client_contacts').select('*').eq('client_id', cid).order('created_at'),
      supabase.from('tasks').select('*').eq('client_id', cid).order('due_date', { ascending: true, nullsFirst: false }),
    ])
    if (docRes.error) console.error(docRes.error)
    if (taskRes.error) console.error(taskRes.error)
    setDocuments(docRes.data || [])
    setContacts(contactRes.data || [])
    setTasks(taskRes.data || [])
  }

  useEffect(() => {
    loadAll()
    const wanted = searchParams.get('client')
    if (wanted) setSelectedId(wanted)
  }, [])

  useEffect(() => { reloadDetail(selectedId) }, [selectedId])

  const clientNameById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c.name])), [clients])

  const filtered = useMemo(
    () => clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [clients, search]
  )
  const selected = clients.find(c => c.id === selectedId) || null
  const selectedProjects = selected ? projects.filter(p => p.client_id === selected.id) : []
  const selectedMarza = selected ? marzaById[selected.id] : null

  const docsByProject = useMemo(() => {
    const map = {}
    for (const d of documents) {
      if (!d.project_id) continue
      if (!map[d.project_id]) map[d.project_id] = []
      map[d.project_id].push(d)
    }
    return map
  }, [documents])

  const progressByProject = useMemo(() => {
    const map = {}
    for (const p of selectedProjects) map[p.id] = computeStageProgress(docsByProject[p.id] || [])
    return map
  }, [selectedProjects, docsByProject])

  const lastContactDays = (act) => {
    if (!act) return null
    const times = [act.last_message_at, act.last_project_at].filter(Boolean)
    if (times.length === 0) return null
    const latest = times.sort().pop()
    return daysSince(latest)
  }

  const handleSelect = (c) => {
    setSelectedId(c.id)
    setTab('Przegląd')
    setSearchParams({ client: c.id })
  }
  const handleBack = () => { setSelectedId(null); setSearchParams({}) }

  const handleClientSaved = (updated) => setClients(prev => prev.map(c => c.id === updated.id ? updated : c))

  // ── widok listy ──────────────────────────────────────────────
  if (!selected) {
    return (
      <div>
        <PageHeader title={t("Klienci & CRM")} subtitle={loading ? 'Ładowanie…' : `${clients.length} kontrahentów widocznych dla Ciebie`}
          right={isZarzad && <button style={{ padding: '7px 13px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.blue, color: '#fff' }}>{t("+ Nowy klient")}</button>} />
        <div style={{ padding: '16px 22px', maxWidth: 1100 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Szukaj klienta…")}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 12, width: '100%', maxWidth: 340, marginBottom: 16, boxSizing: 'border-box' }} />
          {filtered.length === 0 && !loading && <div style={{ fontSize: 11, color: C.muted, padding: 20, textAlign: 'center' }}>{t("Brak klientów do wyświetlenia.")}</div>}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {filtered.map(c => {
              const act = activityById[c.id]
              const days = lastContactDays(act)
              const m = marzaById[c.id]
              return (
                <div key={c.id} onClick={() => handleSelect(c)}
                  style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(c.name) }}>{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{t(TYP_LABELS[c.typ] || c.typ)} · {act?.project_count || 0} {t("zamówień")}{m ? ` · ${Math.round(Number(m.przychod) || 0).toLocaleString('pl-PL')} PLN` : ''}</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: healthColor(days) }} title={days === null ? 'brak danych o kontakcie' : `ostatni kontakt ${days} dni temu`} />
                  <span style={{ color: C.muted, fontSize: 16 }}>›</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── widok 360° klienta ───────────────────────────────────────
  const health = lastContactDays(activityById[selected.id])
  const przychod = Number(selectedMarza?.przychod) || 0
  const marzaVal = Number(selectedMarza?.marza) || 0
  const aktywneZam = selectedProjects.filter(p => p.active).length
  const openTasks = tasks.filter(tk => tk.status !== 'done').length

  return (
    <div>
      <PageHeader title={selected.name} subtitle={t(TYP_LABELS[selected.typ] || selected.typ)} />
      <div style={{ padding: '16px 22px', maxWidth: 1320 }}>
        <div onClick={handleBack} style={{ fontSize: 11.5, fontWeight: 600, color: C.blue, cursor: 'pointer', marginBottom: 14 }}>{t("← Wszyscy klienci")}</div>

        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '26px 28px', color: '#fff',
          background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
          backgroundSize: '300% 300%', animation: 'klGradShift 16s ease infinite',
          boxShadow: '0 14px 36px rgba(10,22,40,.35)', marginBottom: 18,
        }}>
          <style>{`
            @keyframes klGradShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            @keyframes klFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(16px,-12px) scale(1.08); } }
            @keyframes klFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-14px,14px) scale(1.05); } }
            @keyframes klPulse { 0%,100% { box-shadow: 0 0 0 4px rgba(34,197,94,.2); } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }
          `}</style>
          <div style={{ position: 'absolute', top: -70, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'klFloat1 10s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -80, left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.3), transparent 70%)', filter: 'blur(12px)', animation: 'klFloat2 12s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: '#fff', background: 'linear-gradient(135deg,#F59E0B,#EA580C)', boxShadow: '0 8px 20px rgba(234,88,12,.35)' }}>{initials(selected.name)}</div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                {selected.name}
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 11px', borderRadius: 20, letterSpacing: '.3px', background: 'rgba(245,158,11,.18)', color: '#FBBF24', border: '1px solid rgba(245,158,11,.35)' }}>{t(TYP_LABELS[selected.typ] || selected.typ)}</span>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: healthColor(health), display: 'inline-block', animation: 'klPulse 2.4s ease-in-out infinite' }} title={health === null ? t('brak danych o kontakcie') : `${t('ostatni kontakt')} ${health} ${t('dni temu')}`} />
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
                {[selected.address, selected.created_at ? `${t('klient od')} ${new Date(selected.created_at).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}` : null, health !== null ? `${t('ostatni kontakt')} ${health === 0 ? t('dzisiaj') : `${health} ${t('dni temu')}`}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 112 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Obrót YTD")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}>{Math.round(przychod).toLocaleString('pl-PL')} {t("PLN")}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 112 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Marża YTD")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3, color: marzaVal >= 0 ? '#4ADE80' : '#F87171' }}>{Math.round(marzaVal).toLocaleString('pl-PL')} {t("PLN")}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 16px', minWidth: 112 }}>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Aktywne zam.")}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginTop: 3 }}>{aktywneZam}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 6, marginBottom: 18, overflowX: 'auto' }}>
          {TABS.map(({ key, icon }) => {
            let badge = null
            if (key === 'Zamówienia' && selectedProjects.length > 0) badge = selectedProjects.length
            if (key === 'Dokumenty' && documents.length > 0) badge = documents.length
            if (key === 'Zadania' && openTasks > 0) badge = openTasks
            return (
              <div key={key} onClick={() => setTab(key)}
                style={{ padding: '10px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: tab === key ? '#fff' : C.muted, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7, background: tab === key ? C.navy : 'transparent', transition: '.15s' }}>
                <span style={{ fontSize: 14 }}>{icon}</span>{t(key)}
                {badge !== null && <span style={{ background: tab === key ? 'rgba(255,255,255,.2)' : C.bmid, color: tab === key ? '#fff' : C.blue, borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{badge}</span>}
              </div>
            )
          })}
        </div>

        {tab === 'Przegląd' && (
          <TabPrzeglad client={selected} marza={selectedMarza} contacts={contacts} projects={selectedProjects}
            progressByProject={progressByProject} documents={documents} tasks={tasks}
            lastContactDays={health} onClientSaved={handleClientSaved} onOpenProject={(id) => navigate(`/projekty?project=${id}`)} />
        )}
        {tab === 'Zamówienia' && (
          <TabZamowienia projects={selectedProjects} marzaByProject={marzaByProject} progressByProject={progressByProject}
            allProjects={projects} clientNameById={clientNameById} clientId={selected.id}
            onProjectsChanged={reloadProjects} onOpenProject={(id) => navigate(`/projekty?project=${id}`)} />
        )}
        {tab === 'Kalendarz' && (
          <TabKalendarz tasks={tasks} clientId={selected.id} onChanged={() => reloadDetail(selected.id)} />
        )}
        {tab === 'Galeria' && <TabGaleria documents={documents} />}
        {tab === 'Dokumenty' && <TabDokumenty documents={documents} projects={selectedProjects} />}
        {tab === 'Zadania' && (
          <TabZadania tasks={tasks} profiles={profiles} currentUserId={profile?.id} clientId={selected.id}
            onChanged={() => reloadDetail(selected.id)} />
        )}
        {tab === 'Czat' && <TabCzat clientId={selected.id} clientName={selected.name} projectIds={selectedProjects.map(p => p.id)} />}
      </div>
    </div>
  )
}
