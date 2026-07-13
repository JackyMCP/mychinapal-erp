import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { C, fmt } from '../lib/theme'
import { avatarColor, initials } from '../components/klienci/utils'
import { computeStageProgress, STAGE_DEFS } from '../components/projekty/stageDefs'

export default function MojeProjekty() {
  const { t } = useLang()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [clientNameById, setClientNameById] = useState({})
  const [stageByProject, setStageByProject] = useState({})

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      setLoading(true)
      const [clientsRes, myAssignRes] = await Promise.all([
        supabase.from('clients').select('id,name'),
        supabase.from('project_assignments').select('projects(*)').eq('user_id', profile.id),
      ])
      const clientMap = Object.fromEntries((clientsRes.data || []).map(c => [c.id, c.name]))
      setClientNameById(clientMap)
      const myActiveProjects = (myAssignRes.data || []).map(r => r.projects).filter(Boolean).filter(p => p.active)
      setProjects(myActiveProjects)

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
            label: stageDef ? stageDef.name : t('Zakończone (wszystkie etapy)'),
            progressPct,
            missing: stageDef ? stageDef.categories.filter(c => !(docsByProject[p.id] || []).some(d => d.category === c)) : [],
          }
        }
        setStageByProject(stages)
      } else {
        setStageByProject({})
      }
      setLoading(false)
    })()
  }, [profile?.id])

  // grupowanie wg klienta
  const byClient = {}
  for (const p of projects) {
    const cid = p.client_id || 'brak'
    if (!byClient[cid]) byClient[cid] = []
    byClient[cid].push(p)
  }

  return (
    <div>
      <PageHeader title={t("📦 Moje aktywne projekty")} subtitle={t("Twoje zamówienia, pogrupowane wg klienta")} />
      <div style={{ padding: '16px 22px', maxWidth: 1000 }}>
        <div onClick={() => navigate('/')} style={{ fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer', marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          ← {t("Powrót do Dashboardu")}
        </div>

        {loading && <div style={{ fontSize: 12, color: C.muted }}>{t("Ładowanie…")}</div>}

        {!loading && projects.length === 0 && (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px', fontSize: 12, color: C.muted }}>
            {t("Nie masz jeszcze przypisanych projektów — przypisz się w widoku danego zamówienia (sekcja \"Zespół\").")}
          </div>
        )}

        {!loading && Object.entries(byClient).map(([cid, projs]) => (
          <div key={cid} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 13, padding: '15px 18px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(clientNameById[cid] || '') }}>
                {initials(clientNameById[cid] || '?')}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{clientNameById[cid] || t('Nieznany klient')}</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{projs.length} {projs.length === 1 ? t('aktywne zamówienie') : t('aktywne zamówienia')}</div>
            </div>

            {projs.map(p => {
              const stage = stageByProject[p.id]
              return (
                <div key={p.id} className="mp-row" onClick={() => navigate(`/projekty?project=${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 9, cursor: 'pointer', background: C.bg, marginBottom: 6, transition: 'transform .15s ease, box-shadow .15s ease' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: C.blue }}>{p.order_label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 1 }}>{p.name || p.order_label}</div>
                    {stage && (
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>
                        {stage.missing.length > 0
                          ? <span>🔸 {t('Do zrobienia')}: {t('brakuje')} „{stage.missing.join('”, „')}”</span>
                          : <span style={{ color: C.green }}>✅ {t('Wszystkie dokumenty na tym etapie skompletowane')}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {stage && <div style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.blight, color: C.blue, whiteSpace: 'nowrap', marginBottom: 5 }}>{stage.label}</div>}
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>{stage ? `${stage.progressPct}%` : ''}</div>
                  </div>
                  <span style={{ color: C.muted, fontSize: 15 }}>›</span>
                </div>
              );
            })}
          </div>
        ))}

        <style>{`.mp-row:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(15,23,42,.08); }`}</style>
      </div>
    </div>
  );
}
