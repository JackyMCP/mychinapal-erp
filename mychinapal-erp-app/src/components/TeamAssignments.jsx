import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { C } from '../lib/theme'
import { useUI } from '../lib/ui'
import { avatarColor, initials } from './klienci/utils'

// Przypisania pracownik <-> klient <-> projekt, dostępne z Panelu zarządu.
//
// Model danych (bez zmian w schemacie): client_assignments (client_id,
// user_id) i project_assignments (project_id, user_id) — te same tabele,
// z których korzystają ClientTeam.jsx / ProjectTeam.jsx na stronach
// klienta/zamówienia. Ten panel tylko centralizuje zarządzanie nimi w
// jednym miejscu, w dwóch układach (wg pracownika / wg klienta).
//
// WAŻNE ustalenie z użytkownikiem: przypisanie do klienta ma automatycznie
// obejmować też WSZYSTKIE jego projekty (żeby pojawiły się w "Moje aktywne
// projekty"). To robią triggery SQL (cascade_client_assignment_insert/
// _delete, cascade_project_client_link) — więc wystarczy tu tylko
// dodać/usunąć wiersz client_assignments, a projekty zsynchronizują się
// same (po stronie bazy), również gdy przypisanie zrobi ktoś z zakładki
// klienta zamiast stąd.
//
// "Wyjątek per projekt": odznaczenie pojedynczego projektu USUWA tylko
// wiersz project_assignments (nie rusza client_assignments) — osoba nadal
// będzie miała dostęp do PODGLĄDU tego projektu (bo reguły dostępu i tak
// nadają go przez samo przypisanie do klienta), ale zniknie on z jej
// osobistej listy "Moje aktywne projekty". To jedyny rodzaj wyjątku, jaki
// da się dziś zrobić bez przebudowy modelu uprawnień na reguły odmowy —
// zaznaczone też w opisie pod spodem panelu, żeby nie było niejasności.

const chip = (active) => ({
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, padding: '5px 10px 5px 5px',
  borderRadius: 20, cursor: 'pointer', background: active ? C.blight : C.bg,
  border: `1px solid ${active ? C.bmid : C.border}`, color: active ? C.blue : C.text2,
})

export default function TeamAssignments() {
  const { t } = useLang()
  const { toast } = useUI()

  const [tab, setTab] = useState('employee') // 'employee' | 'client'
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [clientAssignments, setClientAssignments] = useState([])
  const [projectAssignments, setProjectAssignments] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [expanded, setExpanded] = useState({}) // clientId -> bool (rozwinięta lista projektów)

  const load = async () => {
    setLoading(true)
    const [pr, cl, pj, ca, pa] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('projects').select('id,client_id,order_label,active').order('order_label'),
      supabase.from('client_assignments').select('id,client_id,user_id'),
      supabase.from('project_assignments').select('id,project_id,user_id'),
    ])
    setProfiles(pr.data || [])
    setClients(cl.data || [])
    setProjects(pj.data || [])
    setClientAssignments(ca.data || [])
    setProjectAssignments(pa.data || [])
    setLoading(false)
    if (!selectedEmployeeId && pr.data?.length) setSelectedEmployeeId(pr.data[0].id)
    if (!selectedClientId && cl.data?.length) setSelectedClientId(cl.data[0].id)
  }
  useEffect(() => { load() }, [])

  const projectsByClient = useMemo(() => {
    const map = {}
    for (const p of projects) { (map[p.client_id] ||= []).push(p) }
    return map
  }, [projects])

  const clientAssignmentRow = (clientId, userId) => clientAssignments.find(a => a.client_id === clientId && a.user_id === userId)
  const projectAssignmentRow = (projectId, userId) => projectAssignments.find(a => a.project_id === projectId && a.user_id === userId)

  const toggleClient = async (clientId, userId) => {
    const row = clientAssignmentRow(clientId, userId)
    if (row) {
      const { error } = await supabase.from('client_assignments').delete().eq('id', row.id)
      if (error) { toast.error(t('Nie udało się usunąć: ') + error.message); return }
    } else {
      const { error } = await supabase.from('client_assignments').insert({ client_id: clientId, user_id: userId })
      if (error) { toast.error(t('Nie udało się przypisać: ') + error.message); return }
    }
    load()
  }

  const toggleProject = async (projectId, userId) => {
    const row = projectAssignmentRow(projectId, userId)
    if (row) {
      const { error } = await supabase.from('project_assignments').delete().eq('id', row.id)
      if (error) { toast.error(t('Nie udało się usunąć: ') + error.message); return }
    } else {
      const { error } = await supabase.from('project_assignments').insert({ project_id: projectId, user_id: userId })
      if (error) { toast.error(t('Nie udało się przypisać: ') + error.message); return }
    }
    load()
  }

  const nameById = Object.fromEntries(profiles.map(p => [p.id, p.full_name]))
  const clientCountFor = (userId) => clientAssignments.filter(a => a.user_id === userId).length

  const ProjectRow = ({ project, userId }) => {
    const assigned = !!projectAssignmentRow(project.id, userId)
    return (
      <span onClick={() => toggleProject(project.id, userId)} style={{ ...chip(assigned), fontSize: 10.5, padding: '3px 9px' }}>
        {assigned ? '✓' : '—'} {project.order_label || t('(bez nazwy)')}
        {!project.active && <span style={{ opacity: .55 }}> ({t('nieaktywne')})</span>}
      </span>
    )
  }

  const ClientChip = ({ client, userId, onToggle }) => {
    const assigned = !!clientAssignmentRow(client.id, userId)
    const isOpen = !!expanded[client.id]
    const clientProjects = projectsByClient[client.id] || []
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span onClick={() => onToggle(client.id, userId)} style={chip(assigned)}>
            {assigned ? '✓' : '+'} {client.name}
          </span>
          {clientProjects.length > 0 && (
            <span onClick={() => setExpanded(e => ({ ...e, [client.id]: !e[client.id] }))}
              style={{ fontSize: 10, color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
              {isOpen ? '▾' : '▸'} {clientProjects.length} {t('projektów')}
            </span>
          )}
        </div>
        {isOpen && clientProjects.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, marginLeft: 16 }}>
            {clientProjects.map(p => <ProjectRow key={p.id} project={p} userId={userId} />)}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>{t("Wczytywanie…")}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <span onClick={() => setTab('employee')} style={{
          fontSize: 11.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
          background: tab === 'employee' ? C.navy : C.bg, color: tab === 'employee' ? '#fff' : C.text2,
        }}>{t("👤 Wg pracownika")}</span>
        <span onClick={() => setTab('client')} style={{
          fontSize: 11.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
          background: tab === 'client' ? C.navy : C.bg, color: tab === 'client' ? '#fff' : C.text2,
        }}>{t("🏢 Wg klienta")}</span>
      </div>

      <div style={{ display: 'flex', gap: 14, minHeight: 260 }}>
        <div style={{ width: 170, flexShrink: 0, borderRight: `1px solid ${C.border}`, paddingRight: 10, overflowY: 'auto', maxHeight: 380 }}>
          {tab === 'employee' ? profiles.map(p => (
            <div key={p.id} onClick={() => setSelectedEmployeeId(p.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
              background: selectedEmployeeId === p.id ? C.blight : 'transparent',
            }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', background: avatarColor(p.full_name), flexShrink: 0 }}>{initials(p.full_name)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
              <span style={{ fontSize: 9, color: C.muted, marginLeft: 'auto', flexShrink: 0 }}>{clientCountFor(p.id)}</span>
            </div>
          )) : clients.map(c => (
            <div key={c.id} onClick={() => setSelectedClientId(c.id)} style={{
              padding: '7px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, fontSize: 11.5, fontWeight: 600, color: C.text,
              background: selectedClientId === c.id ? C.blight : 'transparent',
            }}>{c.name}</div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: 380 }}>
          {tab === 'employee' ? (
            selectedEmployeeId ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 10 }}>
                  {t("Klienci przypisani do: ")}{nameById[selectedEmployeeId]}
                </div>
                {clients.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted }}>{t("Brak klientów.")}</div>
                ) : clients.map(c => <ClientChip key={c.id} client={c} userId={selectedEmployeeId} onToggle={toggleClient} />)}
              </>
            ) : <div style={{ fontSize: 12, color: C.muted }}>{t("Wybierz pracownika z listy.")}</div>
          ) : (
            selectedClientId ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 10 }}>
                  {t("Zespół przypisany do: ")}{clients.find(c => c.id === selectedClientId)?.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {profiles.map(p => (
                    <span key={p.id} onClick={() => toggleClient(selectedClientId, p.id)} style={chip(!!clientAssignmentRow(selectedClientId, p.id))}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7.5, fontWeight: 800, color: '#fff', background: avatarColor(p.full_name) }}>{initials(p.full_name)}</span>
                      {p.full_name}
                    </span>
                  ))}
                </div>
                {(projectsByClient[selectedClientId] || []).length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 8 }}>{t("Projekty tego klienta")}</div>
                    {(projectsByClient[selectedClientId] || []).map(proj => (
                      <div key={proj.id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 4 }}>{proj.order_label || t('(bez nazwy)')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {profiles.map(p => (
                            <span key={p.id} onClick={() => toggleProject(proj.id, p.id)} style={{ ...chip(!!projectAssignmentRow(proj.id, p.id)), fontSize: 10.5, padding: '3px 9px' }}>
                              {!!projectAssignmentRow(proj.id, p.id) ? '✓' : '—'} {p.full_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : <div style={{ fontSize: 12, color: C.muted }}>{t("Wybierz klienta z listy.")}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>{t(
        "Przypisanie do klienta obejmuje automatycznie wszystkie jego projekty (widoczne w \"Moje aktywne projekty\" danej osoby). Odznaczenie pojedynczego projektu (bez odznaczania klienta) usuwa go tylko z tej osobistej listy — podgląd projektu nadal jest dostępny, bo wynika z przypisania do całego klienta."
      )}</div>
    </div>
  );
}
