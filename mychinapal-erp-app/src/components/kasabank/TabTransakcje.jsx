import { useLang } from "../../lib/i18n/LanguageContext";
import { useState, useMemo, useEffect } from 'react'
import { C, fmt } from '../../lib/theme'
import { QUARTERS, Q_LABELS, INTERNAL_CATEGORIES, rowBg, isHelperRow } from './constants'
import Pill from './Pill'
import EditModal from './EditModal'

export default function TabTransakcje({ txs, clients, projects, onSave, initialSearch, initialQ }) {
  const {
    t
  } = useLang();

  const [selQ, setSelQ] = useState(initialQ || 'wszystkie')
  const [filter, setFilter] = useState('wszystkie')
  const [search, setSearch] = useState(initialSearch || '')
  const [editTx, setEditTx] = useState(null)
  const [sortCol, setSortCol] = useState('date')
  const [sortAsc, setSortAsc] = useState(true)
  const [showSRows, setShowSRows] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const handleSort = col => { if (sortCol === col) setSortAsc(a => !a); else { setSortCol(col); setSortAsc(true) } }

  const missingAssign = row => {
    if (isHelperRow(row)) return false
    if (!['WN+', 'MA-'].includes(row.direction)) return false
    if (row.assign) return false
    return !INTERNAL_CATEGORIES.includes((row.category || '').toUpperCase());
  }

  const filtered = useMemo(() => {
    let list = txs.filter(row => {
      if (selQ !== 'wszystkie' && row.q !== selQ) return false
      if (!showSRows && isHelperRow(row)) return false
      const cat = (row.category || '').toUpperCase()
      if (filter === 'wplywy') return row.direction === 'WN+';
      if (filter === 'wyplywy') return row.direction === 'MA-';
      if (filter === 'przychody') return cat === 'PRZYCHÓD'
      if (filter === 'zakupy') return cat === 'ZAKUP TOWARU CHINY'
      if (filter === 'transport') return cat === 'TRANSPORT'
      if (filter === 'odprawa') return cat === 'ODPRAWA CELNA'
      if (filter === 'podatki') return ['PODATKI', 'ZUS'].includes(cat)
      if (filter === 's_rows') return isHelperRow(row);
      if (filter === 'weryfikacja') return cat.includes('WERYFIKACJI') || missingAssign(row);
      if (filter === 'nierozl') return row.status === 'NIE ROZLICZONO';
      if (filter === 'wydat') return INTERNAL_CATEGORIES.includes(cat) && !['PODATKI', 'ZUS'].includes(cat)
      if (search) {
        const s = search.toLowerCase()
        return (row.contractor || '').toLowerCase().includes(s) || (row.desc || '').toLowerCase().includes(s) || (row.assign || '').toLowerCase().includes(s);
      }
      return true
    })
    list.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      if (typeof av === 'number') return sortAsc ? av - bv : bv - av
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return list
  }, [txs, selQ, filter, search, showSRows, sortCol, sortAsc])

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  useEffect(() => { setPage(0) }, [selQ, filter, search])

  const unassignedCount = txs.filter(missingAssign).length
  const weryfikacjaCount = txs.filter(row => (row.category || '').includes('WERYFIKACJI')).length

  const SortTh = ({ col, label, right = false }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: right ? 'right' : 'left', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: sortCol === col ? C.blue : C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {label}{sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const CHIPS = [
    { k: 'wszystkie', l: 'Wszystkie' },
    { k: 'wplywy', l: '↑ WN+ Wpływy' },
    { k: 'wyplywy', l: '↓ MA- Wypływy' },
    { k: 'przychody', l: 'Przychody' },
    { k: 'zakupy', l: 'Zakup Chiny' },
    { k: 'transport', l: 'Transport' },
    { k: 'odprawa', l: 'Odprawa celna' },
    { k: 'podatki', l: 'Podatki/ZUS' },
    { k: 'wydat', l: 'Wydatki firmowe' },
    { k: 'nierozl', l: 'NIE ROZLICZONO' },
    { k: 's_rows', l: 'Wiersze pomocnicze' },
    { k: 'weryfikacja', l: `⚠️ Weryfikacja (${unassignedCount + weryfikacjaCount})`, danger: true },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, flexShrink: 0 }}>{t("Kwartał:")}</span>
        {[{ k: 'wszystkie', l: `Wszystkie (${txs.length})` }, ...QUARTERS.map((q, i) => ({ k: q, l: Q_LABELS[i] }))].map(({ k, l }) => (
          <div key={k} onClick={() => { setSelQ(k); setFilter('wszystkie') }} style={{
            padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${selQ === k ? C.blue : C.border}`,
            background: selQ === k ? C.blue : 'transparent', color: selQ === k ? '#fff' : C.muted,
          }}>{l}</div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={showSRows} onChange={e => setShowSRows(e.target.checked)} />
            {t("Pokaż wiersze pomocnicze")}
          </label>
          <input value={search} onChange={e => { setSearch(e.target.value); setFilter('wszystkie') }}
            placeholder={t("🔍 Szukaj...")} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', fontSize: 11, outline: 'none', width: 180 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {CHIPS.map(({ k, l, danger }) => (
          <div key={k} onClick={() => { setFilter(k); setSearch('') }} style={{
            padding: '3px 9px', borderRadius: 5, fontSize: 10.5, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${filter === k ? C.blue : danger ? C.rmid : C.border}`,
            background: filter === k ? C.blue : danger ? C.rlight : 'transparent',
            color: filter === k ? '#fff' : danger ? C.red : C.muted,
          }}>{l}</div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 10.5, color: C.muted }}>
        <span>{t("Wyświetlono")} <strong style={{ color: C.text }}>{filtered.length}</strong> {t("z")} <strong style={{ color: C.text }}>{txs.length}</strong> {t("transakcji · strona")} {page + 1}/{totalPages || 1}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 10, cursor: 'pointer', background: page === 0 ? C.bg : C.white, color: page === 0 ? C.muted : C.text2 }}>{t("‹ Poprz.")}</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pg = i; if (page > 2 && totalPages > 5) pg = page - 2 + i
            if (pg >= totalPages) return null
            return <button key={pg} onClick={() => setPage(pg)} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${pg === page ? C.blue : C.border}`, fontSize: 10, cursor: 'pointer', background: pg === page ? C.blue : C.white, color: pg === page ? '#fff' : C.text2 }}>{pg + 1}</button>
          })}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 10, cursor: 'pointer', background: page >= totalPages - 1 ? C.bg : C.white, color: page >= totalPages - 1 ? C.muted : C.text2 }}>{t("Nast. ›")}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {[['#F0FDF4', 'Przychód/WN+'], ['#EFF6FF', 'Zakup Chiny'], ['#FEF3E8', 'Transport'], ['#FFF0F5', 'Odprawa'], ['#F5F3FF', 'Podatki/ZUS'], ['#FFFBEB', 'Do weryfikacji'], ['#F8F8F8', 'Wydatki/pomocnicze']].map(([bg, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: C.muted }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${C.border}` }}></div>{l}
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <SortTh col="date" label="Data" />
              <SortTh col="contractor" label="Kontrahent" />
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{t("Opis")}</th>
              <SortTh col="amount" label="Kwota" right />
              <th style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{t("Kier.")}</th>
              <SortTh col="assign" label="Przypisanie" />
              <SortTh col="order" label="Zamówienie" />
              <SortTh col="flow_type" label="Typ" />
              <SortTh col="category" label="Kategoria" />
              <SortTh col="status" label="Status" />
              <th style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{t("Konto")}</th>
              <th style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{t("Uwagi")}</th>
              <th style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((row) => {
              const helper = isHelperRow(row)
              const bg = rowBg(row.category, row.direction, helper)
              const needsAssign = missingAssign(row)
              return (
                <tr key={row.id} style={{ background: bg }} onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.95)'} onMouseLeave={e => e.currentTarget.style.filter = ''}>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontSize: 10, color: C.muted }}>{row.date || '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 11 }} title={row.contractor}>{row.contractor || <span style={{ color: C.muted, fontStyle: 'italic' }}>—</span>}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted, fontSize: 10 }} title={row.desc}>{row.desc ? t(row.desc) : '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700, color: row.amount > 0 ? C.green : row.amount < 0 ? C.red : C.muted, whiteSpace: 'nowrap', fontSize: 11.5 }}>
                    {row.amount !== 0 ? (row.amount > 0 ? '+' : '') + fmt(row.amount, 2) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{row.direction ? <Pill type={row.direction} small /> : <span style={{ color: C.muted, fontSize: 10 }}>—</span>}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: row.assign ? 600 : 400, whiteSpace: 'nowrap', fontSize: 10.5 }}>
                    {needsAssign ? <span style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 3, padding: '1px 5px', fontSize: 9, color: C.orange }}>{t("⚠️ brak")}</span> : (row.assign || <span style={{ color: C.muted, fontSize: 10 }}>—</span>)}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>{row.order || '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{row.flow_type ? <Pill type={row.flow_type} small /> : <span style={{ color: C.muted, fontSize: 10 }}>—</span>}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{row.category ? <Pill type={row.category} small /> : <span style={{ color: C.muted, fontSize: 10 }}>—</span>}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 10, whiteSpace: 'nowrap' }}>
                    {row.status ? <span style={{ fontSize: 9.5, color: row.status === 'ROZLICZONO CAŁKOWICIE' ? C.green : row.status === 'NIE ROZLICZONO' ? C.orange : C.muted }}>{t(row.status)}</span> : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 9.5, color: C.muted, whiteSpace: 'nowrap' }}>{(row.account || '').replace('PLN — ', '').replace(' — pomocniczy', '')}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, color: C.muted }} title={row.notes}>{row.notes ? t(row.notes) : '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditTx(row)} style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${needsAssign ? C.orange : C.border}`, fontSize: 10, cursor: 'pointer', background: needsAssign ? '#FFFBEB' : 'transparent', color: needsAssign ? C.orange : C.text2, whiteSpace: 'nowrap', fontWeight: needsAssign ? 700 : 400 }}>
                      {needsAssign ? t("⚠️ Przypisz") : t("Edytuj")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: C.muted, fontSize: 12 }}>{t("Brak transakcji dla wybranego filtra")}</div>}
      </div>
      {editTx && <EditModal tx={editTx} clients={clients} projects={projects} onSave={(id, changes) => { onSave(id, changes); setEditTx(null) }} onClose={() => setEditTx(null)} />}
    </div>
  );
}
