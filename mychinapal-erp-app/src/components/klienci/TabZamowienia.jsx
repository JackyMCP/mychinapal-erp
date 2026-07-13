import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import ProjectTile from '../projekty/ProjectTile'

export default function TabZamowienia({ projects, marzaByProject, progressByProject, allProjects, clientNameById, clientId, onProjectsChanged, onOpenProject }) {
  const { t } = useLang()
  const [managerOpen, setManagerOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const clientName = clientNameById[clientId] || ''

  const handleAssign = async (project) => {
    const ownerName = clientNameById[project.client_id] || t('inny klient')
    if (!window.confirm(`${t('Przypisać')} „${project.order_label}” ${t('do')} ${clientName}? ${t('Zamówienie zostanie odpięte od')}: ${ownerName}.`)) return
    setBusyId(project.id)
    const { error } = await supabase.from('projects').update({ client_id: clientId, updated_at: new Date().toISOString() }).eq('id', project.id)
    setBusyId(null)
    if (error) { alert('Nie udało się zaktualizować powiązania: ' + error.message); return }
    onProjectsChanged && onProjectsChanged()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: C.muted }}>{projects.length} {t("zamówień powiązanych z tym klientem")}</div>
        <div onClick={() => setManagerOpen(o => !o)} style={{
          background: 'rgba(147,197,253,.12)', border: `1px solid ${C.bmid}`, color: C.blue, fontSize: 11.5, fontWeight: 700,
          padding: '9px 15px', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>🔗 {managerOpen ? t("Zamknij zarządzanie powiązaniami") : t("Zarządzaj powiązaniami")}</div>
      </div>

      {managerOpen && (
        <div style={{ background: C.bg, border: `1px dashed ${C.bmid}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>{t("Które zamówienia należą do")} {clientName}?</div>
          {allProjects.map(p => {
            const belongsHere = p.client_id === clientId
            const ownerName = clientNameById[p.client_id] || '—'
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: belongsHere ? C.text : C.muted }}>{p.order_label}{!belongsHere ? ` (${t('obecnie')}: ${ownerName})` : ''}</span>
                {belongsHere ? (
                  <div title={t("Ten projekt już należy do tego klienta")} style={{ width: 34, height: 19, borderRadius: 20, background: C.green, position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', width: 15, height: 15, borderRadius: '50%', background: '#fff', top: 2, left: 17, boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                  </div>
                ) : (
                  <button onClick={() => handleAssign(p)} disabled={busyId === p.id}
                    style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.blue, cursor: 'pointer', opacity: busyId === p.id ? .5 : 1, whiteSpace: 'nowrap' }}>
                    {busyId === p.id ? t('Zapisywanie…') : t('Przypisz tutaj')}
                  </button>
                )}
              </div>
            )
          })}
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>{t("Przypisanie odpina zamówienie od poprzedniego klienta — zmiana zapisuje się od razu.")}</div>
        </div>
      )}

      {projects.length === 0 && <div style={{ fontSize: 11, color: C.muted, padding: 20, textAlign: 'center' }}>{t("Ten klient nie ma jeszcze zarejestrowanych zamówień.")}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {projects.map(p => (
          <ProjectTile key={p.id} project={p} clientName={clientName} progress={progressByProject[p.id] || { doneStages: new Set(), currentIndex: 1, progressPct: 0 }}
            marza={marzaByProject[p.id]} onClick={() => onOpenProject(p.id)} />
        ))}
      </div>
    </div>
  )
}
