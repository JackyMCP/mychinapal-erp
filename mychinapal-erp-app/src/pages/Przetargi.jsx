import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../lib/i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../lib/ui'
import PageHeader from '../components/PageHeader'
import CountUp from '../components/ui/CountUp'
import TenderDetailsModal from '../components/przetargi/TenderDetailsModal'
import { supabase } from '../lib/supabaseClient'
import { C } from '../lib/theme'
import { avatarColor } from '../components/klienci/utils'

const STATUS_COLUMNS = [
  { key: 'nowy', label: 'Nowy' },
  { key: 'do_oceny', label: 'Do oceny' },
  { key: 'zakwalifikowany', label: 'Zakwalifikowany' },
  { key: 'w_przygotowaniu', label: 'W przygotowaniu' },
  { key: 'zlozona_oferta', label: 'Złożona oferta' },
  { key: 'wygrany', label: 'Wygrany' },
  { key: 'przegrany', label: 'Przegrany' },
  { key: 'uniewazniony', label: 'Unieważniony' },
  { key: 'odrzucony', label: 'Odrzucony' },
]

function daysLeft(deadline) {
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function deadlineColor(days) {
  if (days == null) return C.muted
  if (days < 3) return C.red
  if (days <= 14) return C.orange
  return C.green
}

// Panel Przetargów — Faza 1 (PLAN-PANEL-PRZETARGOW.md). Centrum Sygnałów
// (hero-baner z licznikiem/chipami/pilnością) + kanban wg statusu. Dane
// dopasowane przez tenders-match (warstwy 1-2), zasilane RAZ DZIENNIE przez
// tenders-ingest-bazakonkurencyjnosci (pg_cron 6:00, kaskadowo dopasowanie/AI,
// digest o 6:30 — zmienione z cyklu co 20 min na wyraźne życzenie użytkownika,
// 22.07.2026). Usunięte przetargi znikają całkowicie (twardy DELETE +
// tender_exclusions jako trwała denylist, żeby nie wracały przy ingest).
export default function Przetargi() {
  const { t } = useLang()
  const { profile } = useAuth()
  const { toast, confirm } = useUI()

  const [tenders, setTenders] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [openTenderId, setOpenTenderId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const load = async () => {
    setLoading(true)
    const [tRes, nRes] = await Promise.all([
      supabase.from('tenders').select('*')
        .neq('category', '(brak dopasowania)').not('category', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('tender_notifications').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (tRes.error) console.error(tRes.error)
    if (nRes.error) console.error(nRes.error)
    setTenders(tRes.data || [])
    setNotifications(nRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const tender of tenders) {
      if (!tender.category) continue
      counts[tender.category] = (counts[tender.category] || 0) + 1
    }
    return counts
  }, [tenders])

  const unseenNotifications = useMemo(
    () => notifications.filter(n => !(n.seen_by || []).includes(profile?.id)),
    [notifications, profile?.id]
  )
  const unseenNewMatches = unseenNotifications.filter(n => n.type === 'nowy_dopasowany')
  const unseenAnnexes = unseenNotifications.filter(n => n.type === 'aneks')
  const unseenUrgent = unseenNotifications.filter(n => n.type === 'blisko_terminu')

  const visibleTenders = useMemo(
    () => categoryFilter ? tenders.filter(t => t.category === categoryFilter) : tenders,
    [tenders, categoryFilter]
  )

  // Zaznaczanie wielu przetargów naraz i usuwanie ich jednym kliknięciem (na
  // wyraźne życzenie użytkownika, 22.07.2026 — zamiast potwierdzać usunięcie
  // osobno dla każdego przetargu, "ptaszki" na kafelkach + jeden przycisk
  // usuwa cały zaznaczony zestaw).
  const allVisibleIds = useMemo(() => visibleTenders.map(t2 => t2.id), [visibleTenders])
  const selectedVisibleCount = useMemo(() => allVisibleIds.filter(id => selectedIds.has(id)).length, [allVisibleIds, selectedIds])
  const allVisibleSelected = allVisibleIds.length > 0 && selectedVisibleCount === allVisibleIds.length

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) return new Set()
      return new Set(allVisibleIds)
    })
  }

  const markAllRead = async () => {
    if (unseenNotifications.length === 0 || !profile?.id) return
    const ids = unseenNotifications.map(n => n.id)
    const updates = unseenNotifications.map(n => ({ id: n.id, seen_by: [...(n.seen_by || []), profile.id] }))
    for (const u of updates) {
      await supabase.from('tender_notifications').update({ seen_by: u.seen_by }).eq('id', u.id)
    }
    void ids
    load()
  }

  const markOneRead = async (notification) => {
    if (!profile?.id || (notification.seen_by || []).includes(profile.id)) return
    await supabase.from('tender_notifications').update({ seen_by: [...(notification.seen_by || []), profile.id] }).eq('id', notification.id)
    load()
  }

  const openTender = (tender) => {
    setOpenTenderId(tender.id)
    const related = unseenNotifications.filter(n => n.tender_id === tender.id)
    related.forEach(markOneRead)
  }

  // Usuwanie zaznaczonych przetargów naraz (zastępuje wcześniejsze usuwanie
  // pojedyncze z potwierdzeniem za każdym razem). Twarde usunięcie + wpis do
  // tender_exclusions (denylist) dla każdego, tak samo jak w
  // TenderDetailsModal — patrz komentarz tam po pełne uzasadnienie.
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const ok = await confirm(
      t(`Usunąć ${selectedIds.size} zaznaczonych przetargów całkowicie? Znikną ze wszystkich widoków i nie zostaną ponownie pobrane.`),
      { confirmLabel: t('Usuń') }
    )
    if (!ok) return

    const selected = tenders.filter(t2 => selectedIds.has(t2.id))
    const exclusionRows = selected.map(t2 => ({ source: t2.source, external_id: t2.external_id, excluded_by: profile?.id || null }))
    if (exclusionRows.length > 0) {
      const { error: exErr } = await supabase.from('tender_exclusions').upsert(exclusionRows, { onConflict: 'source,external_id', ignoreDuplicates: true })
      if (exErr) { toast.error(t('Nie udało się zapisać wykluczeń: ') + exErr.message); return }
    }

    const { error } = await supabase.from('tenders').delete().in('id', Array.from(selectedIds))
    if (error) { toast.error(t('Nie udało się usunąć przetargów: ') + error.message); return }

    toast.success(t(`Usunięto ${selected.length} przetargów.`))
    setSelectedIds(new Set())
    load()
  }

  return (
    <div>
      <PageHeader title={t('🎯 Przetargi')} subtitle={t('Dopasowane ogłoszenia z Bazy Konkurencyjności — aktualizacja raz dziennie o 6:30')} />
      <div style={{ padding: '16px 22px' }}>

        {/* Centrum Sygnałów — hero-baner (sekcja 7.2 planu) */}
        <div style={{
          background: `linear-gradient(120deg, ${C.navy}, ${C.navy2})`, borderRadius: 16, padding: '20px 24px',
          color: '#fff', marginBottom: 20, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: 'rgba(255,255,255,.55)', marginBottom: 4 }}>
                {t('Centrum Sygnałów')}
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <CountUp value={unseenNewMatches.length} /> <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>{t('nowych dopasowanych sygnałów')}</span>
              </div>
            </div>
            {unseenNotifications.length > 0 && (
              <button onClick={markAllRead} style={{
                border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: '#fff',
                borderRadius: 9, padding: '9px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              }}>
                {t('Oznacz wszystkie jako przeczytane')}
              </button>
            )}
          </div>

          {Object.keys(categoryCounts).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  style={{
                    border: categoryFilter === cat ? '1.5px solid #fff' : '1px solid rgba(255,255,255,.2)',
                    background: categoryFilter === cat ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)',
                    color: '#fff', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: avatarColor(cat) }} />
                  {cat}: {n}
                </button>
              ))}
            </div>
          )}

          {unseenUrgent.length > 0 && (
            <div style={{ marginTop: 14, background: 'rgba(220,38,38,.25)', border: '1px solid rgba(248,113,113,.4)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, fontWeight: 700 }}>
              ⏰ {unseenUrgent.length} {t('przetargów z terminem w ciągu 48h — sprawdź teraz')}
            </div>
          )}

          {unseenAnnexes.length > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(255,255,255,.08)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
              📝 {unseenAnnexes.length} {t('aneksów/zmian w już ocenionych przetargach')}
            </div>
          )}
        </div>

        {/* Pasek zaznaczania — checkboxy na kafelkach + usuwanie zbiorcze jednym kliknięciem */}
        {!loading && visibleTenders.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.text2, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
              {t('Zaznacz wszystkie')}
            </label>
            {selectedIds.size > 0 && (
              <>
                <span style={{ fontSize: 11.5, color: C.muted }}>{t('Zaznaczono: ')}{selectedIds.size}</span>
                <button onClick={handleBulkDelete} style={{
                  border: 'none', background: C.red, color: '#fff', borderRadius: 8, padding: '7px 14px',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                }}>
                  {t('🗑️ Usuń zaznaczone')} ({selectedIds.size})
                </button>
                <button onClick={() => setSelectedIds(new Set())} style={{
                  border: 'none', background: 'transparent', color: C.muted, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline',
                }}>
                  {t('Anuluj zaznaczenie')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Kanban wg statusu (sekcja 7.3 planu) */}
        {loading ? (
          <div style={{ fontSize: 12.5, color: C.muted, padding: 20 }}>{t('Ładowanie…')}</div>
        ) : (
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
            {STATUS_COLUMNS.map(col => {
              const colTenders = visibleTenders.filter(t2 => t2.status === col.key)
              if (colTenders.length === 0 && ['wygrany', 'przegrany', 'uniewazniony', 'odrzucony'].includes(col.key)) return null
              return (
                <div key={col.key} style={{ minWidth: 260, flexShrink: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text2, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t(col.label)} <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>({colTenders.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTenders.map(tender => {
                      const dLeft = daysLeft(tender.submission_deadline)
                      return (
                        <div key={tender.id} onClick={() => openTender(tender)}
                          style={{
                            background: selectedIds.has(tender.id) ? C.blight : C.white,
                            border: `1px solid ${selectedIds.has(tender.id) ? C.blue : C.border}`, borderRadius: 10, padding: '10px 12px 10px 30px',
                            cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)', position: 'relative',
                          }}>
                          <input type="checkbox" checked={selectedIds.has(tender.id)} onClick={e => toggleSelect(e, tender.id)} onChange={() => {}}
                            style={{ position: 'absolute', top: 10, left: 10, cursor: 'pointer' }} />
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.3 }}>
                            {tender.title.length > 90 ? tender.title.slice(0, 90) + '…' : tender.title}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 6 }}>{tender.buyer_name || t('Nabywca nieznany')}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: avatarColor(tender.category) + '22', color: avatarColor(tender.category) }}>
                              {tender.category}
                            </span>
                            {dLeft != null && (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: deadlineColor(dLeft) }}>
                                {dLeft >= 0 ? `${dLeft}d` : t('po terminie')}
                              </span>
                            )}
                          </div>
                          {tender.match_score != null && (
                            <div style={{ marginTop: 6, height: 3, borderRadius: 3, background: C.bg, overflow: 'hidden' }}>
                              <div style={{ width: `${tender.match_score}%`, height: '100%', background: C.blue }} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {colTenders.length === 0 && (
                      <div style={{ fontSize: 11, color: C.muted, padding: '10px 0' }}>—</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {openTenderId && (
        <TenderDetailsModal tenderId={openTenderId} onClose={() => setOpenTenderId(null)} onChanged={load} />
      )}
    </div>
  )
}
