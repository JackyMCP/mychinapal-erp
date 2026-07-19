import { useLang } from "../lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { C, fmt } from '../lib/theme'
import { useUI } from '../lib/ui'
import useIsMobile from '../lib/useIsMobile'
import NewProjectModal from '../components/projekty/NewProjectModal'
import { detectQuoteValue, saveQuoteFile, previewQuoteFile } from '../lib/quoteIntake'
import QuoteValueModal from '../components/wyceny/QuoteValueModal'
import QuotePreviewModal from '../components/wyceny/QuotePreviewModal'

// Wyceny to teraz po prostu moduł do wgrywania GOTOWYCH plików Excel — jedna
// "karta wyceny" na zamówienie, z dwoma slotami: plik od zespołu CN (surowa
// wycena fabryczna) i TEN SAM plik poprawiony przez zespół PL (doliczona
// marża — wycena dla klienta). Żadnego rozbijania na pozycje/zdjęcia/AI —
// tylko plik + jedna wykryta/poprawiona suma do szybkiej weryfikacji.
export default function Wyceny() {
  const { t } = useLang()
  const { toast, confirm } = useUI()
  const isMobile = useIsMobile()
  const [quotes, setQuotes] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [pickClient, setPickClient] = useState('')
  const [pickProject, setPickProject] = useState('')
  const [pickSide, setPickSide] = useState('cn')
  const [pickFile, setPickFile] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [pendingQuoteFile, setPendingQuoteFile] = useState(null) // { file, side, project, client, detectedValue, itemCount }
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightId, setHighlightId] = useState(null)
  const tileRefs = useRef({})

  // Pozwala przejść jednym kliknięciem wprost do konkretnej karty wyceny z
  // zewnątrz (np. z checklisty etapów zamówienia) przez link
  // /wyceny?quote=<id> — podświetla i przewija do właściwego kafelka.
  useEffect(() => {
    const wanted = searchParams.get('quote')
    if (wanted) {
      setHighlightId(wanted)
      setTimeout(() => tileRefs.current[wanted]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200)
      setTimeout(() => setHighlightId(null), 2500)
    }
  }, [searchParams])

  const loadAll = async () => {
    setLoading(true)
    const [qRes, cRes, pRes] = await Promise.all([
      supabase.from('quotes').select('*, clients(id,name), projects(id,order_label)').order('updated_at', { ascending: false }),
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('projects').select('id,client_id,order_label').order('created_at', { ascending: false }),
    ])
    if (qRes.error) console.error(qRes.error)
    setQuotes(qRes.data || [])
    setClients(cRes.data || [])
    setProjects(pRes.data || [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  const clientProjects = useMemo(() => projects.filter(p => p.client_id === pickClient), [projects, pickClient])
  const pickClientName = useMemo(() => clients.find(c => c.id === pickClient)?.name || '', [clients, pickClient])

  const handleProjectCreated = (project) => {
    setProjects(prev => [project, ...prev])
    setPickProject(project.id)
    setNewProjectOpen(false)
    toast.success(t('Utworzono nowe zamówienie „' + project.order_label + '”.'))
  }

  const filtered = quotes.filter(q => {
    if (!search) return true
    const s = search.toLowerCase()
    return (q.clients?.name || '').toLowerCase().includes(s) || (q.projects?.order_label || '').toLowerCase().includes(s)
  })

  const handlePickFileContinue = async () => {
    if (!pickClient || !pickProject) { toast.error(t('Wybierz klienta i zamówienie.')); return }
    if (!pickFile) { toast.error(t('Wybierz plik.')); return }
    const project = projects.find(p => p.id === pickProject)
    const client = clients.find(c => c.id === pickClient)
    setDetecting(true)
    const { value, itemCount } = await detectQuoteValue(pickFile)
    setDetecting(false)
    setPicking(false)
    setPendingQuoteFile({ file: pickFile, side: pickSide, project, client, detectedValue: value, itemCount })
  }

  // Szybkie wgranie/nadpisanie pliku wprost z kafelka (bez przechodzenia
  // przez okno "+ Wgraj wycenę" i ponownego wybierania klienta/zamówienia —
  // to już wiadomo z samej karty wyceny). Używane głównie do wgrania wyceny
  // dla klienta przez zespół PL bezpośrednio z kafelka, ale działa dla obu stron.
  const handleQuickUpload = async (q, side, file) => {
    setDetecting(true)
    const { value, itemCount } = await detectQuoteValue(file)
    setDetecting(false)
    setPendingQuoteFile({
      file, side,
      project: { id: q.project_id, client_id: q.client_id },
      client: { id: q.client_id, name: q.clients?.name },
      detectedValue: value, itemCount,
    })
  }

  const handleCancelQuoteValue = () => { setPendingQuoteFile(null); if (pickFile) setPicking(true) }

  const handleConfirmQuoteValue = async (value) => {
    const { file, side, project, client } = pendingQuoteFile
    setSaving(true)
    const result = await saveQuoteFile({ file, project, client, side, value, source: 'manual' })
    setSaving(false)
    if (!result.ok) { toast.error(t('Nie udało się zapisać wyceny: ') + result.error); return }
    setPendingQuoteFile(null)
    setPickClient(''); setPickProject(''); setPickFile(null); setPickSide('cn')
    await loadAll()
    const actionLabel = result.overwritten ? t('Wycena nadpisana ✓') : t('Wycena zapisana ✓')
    if (side === 'cn') {
      toast.success(`${actionLabel} — ${t('powiadomiono')} ${result.notified} ${t('os. z zespołu')}`)
      if (result.notifyFailed) toast.error(t('Uwaga: część powiadomień mogła się nie wysłać.'))
    } else {
      toast.success(actionLabel)
    }
  }

  const handleDelete = async (q, e) => {
    e.stopPropagation()
    if (!await confirm(t(`Usunąć kartę wyceny zamówienia „${q.projects?.order_label || ''}”? Tej operacji nie da się cofnąć.`))) return
    await supabase.from('tasks').delete().eq('quote_id', q.id).neq('status', 'done')
    const { error } = await supabase.from('quotes').delete().eq('id', q.id)
    if (error) { toast.error(t('Nie udało się usunąć: ') + error.message); return }

    // Karta wyceny to jedyny wiersz `quotes` tego zamówienia (unique na
    // project_id) — po jej usunięciu zamówienie zawsze zostaje bez wyceny.
    // Jeśli to było jeszcze puste (testowe) zamówienie bez żadnych innych
    // danych, proponujemy usunięcie też samego zamówienia — tak jak dotąd.
    if (q.project_id) {
      try {
        const { data } = await supabase.functions.invoke('delete-project', { body: { projectId: q.project_id } })
        if (data?.needs_confirmation) {
          const c = data.counts || {}
          const parts = []
          if (c.invoices) parts.push(`${t('faktur')}: ${c.invoices}`)
          if (c.transactions) parts.push(`${t('transakcji')}: ${c.transactions}`)
          if (c.transaction_splits) parts.push(`${t('podziałów transakcji')}: ${c.transaction_splits}`)
          if (c.warehouse_documents) parts.push(`${t('dokumentów magazynowych')}: ${c.warehouse_documents}`)
          const ok2 = await confirm(
            t(`To była wycena zamówienia „${data.order_label}”. Ma ono jednak powiązane realne dane księgowe/magazynowe (${parts.join(', ')}) — zostaną zachowane, ale stracą powiązanie z tym zamówieniem. Usunąć mimo to samo (teraz bez wyceny) zamówienie?`),
            { confirmLabel: t('Usuń zamówienie') },
          )
          if (ok2) await supabase.functions.invoke('delete-project', { body: { projectId: q.project_id, force: true } })
        }
      } catch { /* najlepszy wysiłek — usunięcie samej wyceny i tak się udało */ }
    }
    await loadAll()
  }

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: C.muted }}>{t("Ładowanie wycen…")}</div>

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '20px 26px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <style>{`
        @keyframes wycFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-10px) scale(1.06); } }
        @keyframes wycCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wycHighlight { 0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } 50% { box-shadow: 0 0 0 4px rgba(37,99,235,.35); } }
        .wyc-card { animation: wycCardIn .25s ease both; transition: transform .15s ease, box-shadow .15s ease; }
        .wyc-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(10,22,40,.1); }
        .wyc-card.wyc-highlight { animation: wycHighlight 1.1s ease 2; }
      `}</style>

      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '26px 30px', color: '#fff',
        background: `linear-gradient(120deg, ${C.navy} 0%, ${C.navy2} 45%, #16213E 75%, ${C.navy} 100%)`,
        backgroundSize: '300% 300%', boxShadow: '0 14px 36px rgba(10,22,40,.35)', marginBottom: 20,
      }}>
        <div style={{ position: 'absolute', top: -70, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', filter: 'blur(10px)', animation: 'wycFloat1 10s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 50, height: 50, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>📝</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 21, fontWeight: 800 }}>{t("Wyceny")}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{t("Plik od zespołu CN + ten sam plik z marżą od zespołu PL — po jednej karcie na zamówienie")}</div>
          </div>
          <button onClick={() => setPicking(true)} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: C.blue, color: '#fff', boxShadow: '0 6px 18px rgba(37,99,235,.4)' }}>
            {t("+ Wgraj wycenę")}
          </button>
        </div>
      </div>

      {picking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPicking(false)}>
          <div style={{ background: C.white, borderRadius: 14, padding: 24, width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("Wgraj wycenę")}</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 14 }}>{t("Wybierz klienta, zamówienie i czyj to plik — po zapisaniu poprosimy o potwierdzenie łącznej wartości.")}</div>

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Klient")}</label>
            <select value={pickClient} onChange={e => { setPickClient(e.target.value); setPickProject('') }}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, width: '100%', marginBottom: 12, boxSizing: 'border-box' }}>
              <option value="">{t("— wybierz —")}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{t("Zamówienie")}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={pickProject} onChange={e => setPickProject(e.target.value)} disabled={!pickClient}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}>
                <option value="">{t("— wybierz —")}</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.order_label}</option>)}
              </select>
              <button type="button" onClick={() => setNewProjectOpen(true)} disabled={!pickClient} title={t('Nowe zamówienie dla tego klienta')}
                style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.blue}`, background: C.blight, color: C.blue, fontSize: 12, fontWeight: 700, cursor: pickClient ? 'pointer' : 'not-allowed', opacity: pickClient ? 1 : .5 }}>
                {t("+ Nowe")}
              </button>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>{t("Czyj to plik?")}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, border: `1.5px solid ${pickSide === 'cn' ? C.blue : C.border}`, background: pickSide === 'cn' ? C.blight : C.bg, borderRadius: 8, padding: '8px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                <input type="radio" checked={pickSide === 'cn'} onChange={() => setPickSide('cn')} />{t("Zespół CN")}
              </label>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, border: `1.5px solid ${pickSide === 'pl' ? C.blue : C.border}`, background: pickSide === 'pl' ? C.blight : C.bg, borderRadius: 8, padding: '8px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                <input type="radio" checked={pickSide === 'pl'} onChange={() => setPickSide('pl')} />{t("Zespół PL (z marżą)")}
              </label>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>{t("Plik")}</label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, border: `1.5px dashed ${pickFile ? C.blue : C.border}`,
              background: pickFile ? C.blight : C.bg, borderRadius: 9, padding: '12px 13px', cursor: 'pointer', marginBottom: 16,
            }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: pickFile ? C.blue : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pickFile ? pickFile.name : t("Wybierz plik…")}
                </span>
                <span style={{ display: 'block', fontSize: 9.5, color: C.muted, marginTop: 1 }}>{t("Excel (.xlsx/.xls) — spróbujemy automatycznie wykryć sumę")}</span>
              </span>
              <input type="file" onChange={e => setPickFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setPicking(false); setPickFile(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>{t("Anuluj")}</button>
              <button onClick={handlePickFileContinue} disabled={detecting || !pickClient || !pickProject || !pickFile} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (detecting || !pickClient || !pickProject || !pickFile) ? .6 : 1 }}>
                {detecting ? t("Analizowanie pliku…") : t("Dalej")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingQuoteFile && (
        <QuoteValueModal
          file={pendingQuoteFile.file}
          side={pendingQuoteFile.side}
          detectedValue={pendingQuoteFile.detectedValue}
          itemCount={pendingQuoteFile.itemCount}
          saving={saving}
          onConfirm={handleConfirmQuoteValue}
          onCancel={handleCancelQuoteValue}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          clientId={pickClient}
          clientName={pickClientName}
          onClose={() => setNewProjectOpen(false)}
          onCreated={handleProjectCreated}
        />
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("🔍 Szukaj wg klienta, zamówienia…")}
        style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 13px', fontSize: 12, width: '100%', maxWidth: 360, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted, fontSize: 12, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          {t("Brak wycen — kliknij „+ Wgraj wycenę”, żeby zacząć.")}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map((q, i) => (
          <QuoteTile key={q.id} q={q} i={i} highlighted={highlightId === q.id}
            tileRef={el => { tileRefs.current[q.id] = el }}
            onDelete={handleDelete} onQuickUpload={handleQuickUpload} t={t} toast={toast} />
        ))}
      </div>
    </div>
  )
}

function QuoteTile({ q, i, highlighted, tileRef, onDelete, onQuickUpload, t, toast }) {
  const hasCn = !!q.source_excel_path
  const hasPl = !!q.client_excel_path
  const [preview, setPreview] = useState(null) // { fileName, rows, total, loading, error }

  const handleDownload = async (path, e) => {
    e.stopPropagation()
    if (!path) return
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(path, 3600)
    if (error) { toast.error(t('Nie udało się pobrać pliku: ') + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  // Podgląd wyceny chińskiej wprost z kafelka — bez pobierania pliku, tylko
  // szybki wgląd w rozpoznane pozycje (patrz previewQuoteFile w quoteIntake.js).
  const handlePreviewCn = async (e) => {
    e.stopPropagation()
    setPreview({ fileName: q.source_excel_name, rows: [], total: 0, loading: true, error: null })
    const res = await previewQuoteFile(q.source_excel_path, q.source_excel_name)
    setPreview({ fileName: q.source_excel_name, rows: res.rows, total: res.total, loading: false, error: res.ok ? null : res.error })
  }

  // Wgranie/nadpisanie wyceny dla klienta wprost z kafelka — zespół PL nie
  // musi przechodzić przez górne okno "+ Wgraj wycenę" i ponownie wybierać
  // klienta/zamówienie, bo to już wiadomo z samej karty.
  const handlePickPlFile = (e) => {
    e.stopPropagation()
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onQuickUpload(q, 'pl', file)
  }

  return (
    <div ref={tileRef} className={`wyc-card${highlighted ? ' wyc-highlight' : ''}`} style={{ animationDelay: `${i * 0.03}s`, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13.5, fontWeight: 700 }}>{q.projects?.order_label || '—'}</div>
        <span onClick={(e) => onDelete(q, e)} title={t('Usuń kartę wyceny')}
          style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: C.red, background: C.rlight, border: `1px solid ${C.rmid}`, cursor: 'pointer', flexShrink: 0 }}
          className="wyc-del">🗑</span>
        <style>{`.wyc-del:hover { background: ${C.red} !important; color: #fff !important; }`}</style>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>{q.clients?.name || '—'}</div>

      <div onClick={hasCn ? (e) => handleDownload(q.source_excel_path, e) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, marginBottom: 8, background: hasCn ? C.glight : C.rlight, cursor: hasCn ? 'pointer' : 'default' }}>
        <span style={{ fontSize: 13 }}>{hasCn ? '✓' : '✗'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: hasCn ? C.green : C.red }}>{t('Wycena od zespołu CN')}</div>
          <div style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hasCn ? `${q.source_excel_name || ''} · ${fmt(q.source_value_cny, 0)} CNY` : t('brak — czeka na plik')}
          </div>
        </div>
        {hasCn && (
          <span onClick={handlePreviewCn} title={t('Podgląd wyceny CN')}
            style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: C.white, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
            👁
          </span>
        )}
      </div>

      <div onClick={hasPl ? (e) => handleDownload(q.client_excel_path, e) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, marginBottom: 10, background: hasPl ? C.glight : C.rlight, cursor: hasPl ? 'pointer' : 'default' }}>
        <span style={{ fontSize: 13 }}>{hasPl ? '✓' : '✗'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: hasPl ? C.green : C.red }}>{t('Wycena dla klienta (z marżą)')}</div>
          <div style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hasPl ? `${q.client_excel_name || ''} · ${fmt(q.client_value_pln, 0)} PLN` : t('brak — nie dodano marży')}
          </div>
        </div>
        <label onClick={e => e.stopPropagation()} title={t(hasPl ? 'Wgraj ponownie (nadpisz)' : 'Wgraj wycenę dla klienta')}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.blue}`, background: C.white, color: C.blue, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ⬆ {t('Wgraj')}
          <input type="file" onChange={handlePickPlFile} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ fontSize: 9.5, color: C.muted }}>{new Date(q.updated_at).toLocaleDateString('pl-PL')}</div>

      {preview && (
        <QuotePreviewModal
          title="Podgląd wyceny CN"
          fileName={preview.fileName}
          side="cn"
          rows={preview.rows}
          total={preview.total}
          loading={preview.loading}
          error={preview.error}
          onDownload={(e) => handleDownload(q.source_excel_path, e)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
