import { useLang } from "../../lib/i18n/LanguageContext";
import { useState } from 'react'
import { C, fmt } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'
import { STAGE_DEFS } from './stageDefs'

export default function ProjectTile({ project, clientName, progress, marza, onClick, clients, onAssignClient }) {
  const {
    t
  } = useLang();
  const [assigning, setAssigning] = useState(false)
  const [saving, setSaving] = useState(false)

  const { doneStages, currentIndex, progressPct } = progress
  const isDone = currentIndex === null
  const currentStage = STAGE_DEFS.find(s => s.key === currentIndex)

  const realized = marza && (Number(marza.przychod) || Number(marza.zakup) || Number(marza.marza))
  let profitLabel, profitVal, profitClass
  if (isDone && realized) {
    profitLabel = 'Zysk rzeczywisty'
    profitVal = `${fmt(marza.marza, 0)} PLN`
    profitClass = Number(marza.marza) >= 0 ? 'profit' : 'profit neg'
  } else if (project.value != null && project.est_zakup != null) {
    const zysk = Number(project.value || 0) - Number(project.est_zakup || 0) - Number(project.est_transport || 0) - Number(project.est_clo || 0)
    profitLabel = 'Szacowany zysk'
    profitVal = `${fmt(zysk, 0)} PLN`
    profitClass = zysk >= 0 ? 'profit' : 'profit neg'
  } else {
    profitLabel = 'Szacowany zysk'
    profitVal = '— uzupełnij tabelkę'
    profitClass = 'tbd'
  }

  let nextAction, nextClass
  if (isDone) {
    nextAction = '✓ Wszystkie etapy zakończone'
    nextClass = 'done'
  } else if (currentStage) {
    nextAction = `⏳ Czeka na: ${currentStage.categories.join(' / ')}`
    nextClass = 'waiting'
  } else {
    nextAction = '—'
    nextClass = ''
  }

  return (
    <div className="ux-hover-lift" onClick={onClick} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, background: avatarColor(clientName) }}>{initials(clientName)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {assigning ? (
            <select
              autoFocus
              defaultValue={project.client_id}
              disabled={saving}
              onClick={e => e.stopPropagation()}
              onChange={async e => {
                e.stopPropagation()
                const newClientId = e.target.value
                if (newClientId === project.client_id) { setAssigning(false); return }
                setSaving(true)
                await onAssignClient(project, newClientId)
                setSaving(false)
                setAssigning(false)
              }}
              style={{ fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 5px', maxWidth: 150 }}
            >
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName}</span>
              {clients && onAssignClient && (
                <span
                  onClick={e => { e.stopPropagation(); setAssigning(true) }}
                  title={t("Przypisz do innego klienta")}
                  style={{ fontSize: 10, color: C.blue, cursor: 'pointer', flexShrink: 0 }}
                >🔗</span>
              )}
            </div>
          )}
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35, marginTop: 1 }}>{project.order_label}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, margin: '10px 0 6px' }}>
        {STAGE_DEFS.map(s => (
          <div key={s.key} style={{ flex: 1, height: 5, borderRadius: 3, background: doneStages.has(s.key) ? C.green : (s.key === currentIndex ? C.blue : C.border) }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: C.text2 }}>{t(isDone ? `Etap 9/9 — Zakończone` : `Etap ${currentIndex}/9 — ${currentStage?.name || ''}`)}</span>
        <span>{progressPct}%</span>
      </div>
      <div style={{
        display: 'flex', gap: 7, background: nextClass === 'waiting' ? C.olight : nextClass === 'done' ? C.glight : C.bg,
        color: nextClass === 'waiting' ? C.orange : nextClass === 'done' ? C.green : C.text2,
        borderRadius: 9, padding: '8px 10px', fontSize: 10.5, marginBottom: 12, lineHeight: 1.4,
      }}>{t(nextAction)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div><div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{t("Wartość zamówienia")}</div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, marginTop: 2 }}>{project.value != null ? `${fmt(project.value, 0)} PLN` : '—'}</div></div>
        <div><div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{t(profitLabel)}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: profitClass === 'tbd' ? 11 : 15, fontWeight: profitClass === 'tbd' ? 600 : 800, marginTop: 2, color: profitClass === 'profit' ? C.green : profitClass === 'profit neg' ? C.red : C.muted }}>{t(profitVal)}</div>
        </div>
      </div>
    </div>
  );
}
