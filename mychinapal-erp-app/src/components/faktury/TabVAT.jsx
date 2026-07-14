import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo, useState } from 'react'
import { C } from '../../lib/theme'
import { monthRange } from './utils'
import useIsMobile from '../../lib/useIsMobile'

function toCsv(rows) {
  const header = ['Numer', 'Data', 'Kontrahent', 'Netto', 'VAT', 'Brutto', 'Waluta']
  const lines = [header.join(';')]
  for (const r of rows) lines.push([r.number, r.invoice_date, (r.clients?.name || '').replace(/;/g, ','), r.subtotal_net, r.vat_total, r.total_gross, r.currency].join(';'))
  return lines.join('\n')
}

export default function TabVAT({ invoices }) {
  const { t } = useLang()
  const isMobile = useIsMobile()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const monthInvoices = useMemo(() => {
    const { start, end } = monthRange(`${month}-01`)
    return invoices.filter(inv => inv.typ !== 'pro forma' && inv.invoice_date >= start && inv.invoice_date < end)
  }, [invoices, month])

  const vatNalezny = monthInvoices.reduce((s, i) => s + (Number(i.vat_total) || 0), 0)
  const nettoRazem = monthInvoices.reduce((s, i) => s + (Number(i.subtotal_net) || 0), 0)

  const handleExport = () => {
    const csv = toCsv(monthInvoices)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `faktury_${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>{t("Zestawienie VAT z faktur wystawionych w tym module")}</div>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 11 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12 }}>
          <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("Netto razem")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>{nettoRazem.toFixed(2)} PLN</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("VAT należny (sprzedaż)")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>{vatNalezny.toFixed(2)} PLN</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{t("Liczba faktur")}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>{monthInvoices.length}</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          {t("To zestawienie liczy VAT należny wyłącznie z faktur wystawionych w tym module. Pełne rozliczenie VAT (razem z naliczonym z zakupów i odprawy celnej) znajdziesz w Kasa & Bank → VAT, liczone na żywo z rzeczywistych transakcji bankowych.")}
        </div>
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{t("Eksport zestawienia")}</div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {t("Plik CSV z fakturami tego miesiąca — do przekazania księgowej. Pełny, zgodny ze schematem XML JPK_V7 eksport to osobny, większy etap prac — wymaga walidacji z księgową, żeby nie wysłać do urzędu błędnie sformatowanego pliku.")}
            </div>
          </div>
          <button onClick={handleExport} style={{ border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: C.blue, color: '#fff', whiteSpace: 'nowrap' }}>{t("Eksportuj CSV")}</button>
        </div>
      </div>
    </div>
  )
}
