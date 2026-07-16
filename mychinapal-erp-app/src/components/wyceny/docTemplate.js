import { fetchAsDataUrl } from './pdf'
import { toNum } from './calc'

// Dokument wyceny — PODGLĄD jest zawsze renderowany BEZPOŚREDNIO z danych
// formularza (ta funkcja, czysta i synchroniczna) i wyświetlany przez
// dangerouslySetInnerHTML — NIGDY nie przechodzi przez edytor tekstu, więc
// nigdy się nie może "połamać". Edytowalna jest TYLKO sekcja
// warunków/dodatkowej treści (notesHtml, z prostego edytora TipTap bez
// tabel) — ona jedna wstawia się do szablonu jako gotowy fragment HTML.
// Wcześniejsza wersja ładowała CAŁY ten szablon (tabele, gradienty w tle) do
// edytora rich-text — schemat ProseMirror nie obsługuje dowolnego HTML
// (tabele bez rozszerzenia Table, atrybuty style poza schematem są
// odrzucane), więc układ wychodził połamany/nieczytelny. Stąd ten podział.
export async function loadLogoDataUrl() {
  return fetchAsDataUrl('/logo-white.png')
}

const NAVY = '#0A1628'
const NAVY2 = '#132A4A'
const GOLD = '#B48C28'
const GOLD_LIGHT = '#D4AF5A'
const TEXT = '#141414'
const MUTED = '#64748B'

export function fmtPlnHtml(n) {
  return Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Czysta, synchroniczna funkcja renderująca — używana zarówno przez żywy
// podgląd na ekranie (useMemo, przeliczany przy każdej zmianie formularza)
// jak i przez eksport do PDF (te same dane, tylko zdjęcia/logo jako base64
// zamiast podpisanych URL-i, żeby PDF był samodzielny).
export function renderQuoteDocHtml({ quote, client, contact, company, rows, totals, photoDataUrls = {}, logoDataUrl, notes }) {
  const sellerLines = [
    company?.company_name || 'MyChinaPal Sp. z o.o.',
    company?.company_address || '',
    company?.company_nip ? `NIP: ${company.company_nip}` : '',
    company?.company_krs ? `KRS: ${company.company_krs}` : '',
    company?.company_regon ? `REGON: ${company.company_regon}` : '',
  ].filter(Boolean)
  const buyerLines = [
    client?.full_name || client?.name || '',
    client?.address || '',
    client?.nip ? `NIP: ${client.nip}` : '',
    client?.krs ? `KRS: ${client.krs}` : '',
    contact?.email || '',
    contact?.phone || '',
  ].filter(Boolean)

  const itemsHtml = (rows || []).map(r => {
    const photos = photoDataUrls[r._key] || []
    const cover = photos[0]
    const extra = photos.slice(1, 4)
    const metaBits = [`Ilość: ${r.qty} ${r.unit || ''}`]
    if (r.production_days) metaBits.push(`Produkcja: ${r.production_days} dni`)
    if (r.weight_kg) metaBits.push(`Waga: ${r.weight_kg} kg`)
    if (r.cbm) metaBits.push(`CBM: ${r.cbm} m³`)
    else if (r.container_note) metaBits.push(escapeHtml(r.container_note))
    // Zawsze pokazujemy DWIE ceny netto przy każdej pozycji, niezależnie od
    // tego czy to jedna pozycja z importu Excela z ilością 10 szt., czy 10
    // pozycji po 100 szt.: cenę jednostkową (za 1 szt.) i cenę za całą
    // pozycję (ilość × cena jednostkowa) — klient musi widzieć obie.
    const qtyNum = toNum(r.qty)
    const unitNetto = qtyNum > 0 ? r.finalPrice / qtyNum : r.finalPrice
    return `
      <table style="width:100%; border-collapse:collapse; margin-bottom:14px; border:1px solid #E1E3E7; border-radius:10px;">
        <tr>
          <td style="width:130px; padding:12px; vertical-align:top;">
            ${cover ? `<img src="${cover}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;" />` : `<div style="width:120px;height:120px;border-radius:8px;background:#F7F8FA;border:1px solid #D7D7D7;"></div>`}
            ${extra.length ? `<div style="margin-top:6px;">${extra.map(p => `<img src="${p}" style="width:26px;height:26px;object-fit:cover;border-radius:5px;margin-right:4px;" />`).join('')}</div>` : ''}
          </td>
          <td style="padding:12px; vertical-align:top;">
            <div style="font-size:14px; font-weight:700; color:${TEXT};">${escapeHtml(r.name || '—')}</div>
            ${r.specification ? `<div style="font-size:11px; color:${MUTED}; margin-top:4px;">${escapeHtml(r.specification)}</div>` : ''}
            <div style="font-size:11px; color:${MUTED}; margin-top:8px;">${metaBits.join(' &nbsp;·&nbsp; ')}</div>
          </td>
          <td style="width:160px; padding:12px; vertical-align:bottom; text-align:right;">
            <div style="font-size:10.5px; color:${MUTED}; margin-bottom:3px;">Cena netto/szt.: ${fmtPlnHtml(unitNetto)} PLN</div>
            <div style="font-size:16px; font-weight:700; color:${GOLD};">Razem netto: ${fmtPlnHtml(r.finalPrice)} PLN</div>
          </td>
        </tr>
      </table>`
  }).join('')

  const transportBlock = (totals.transportShare > 0 && totals.landedCost > 0) ? (() => {
    const scale = totals.finalPrice / totals.landedCost
    const transportNetto = totals.transportShare * scale
    const transportBrutto = transportNetto * (1 + (totals.vatAmount / (totals.finalPrice || 1)))
    return `<div style="display:flex; justify-content:space-between; font-size:11px; color:${MUTED}; margin-bottom:6px;">
      <span>w tym transport (netto/brutto):</span><span>${fmtPlnHtml(transportNetto)} / ${fmtPlnHtml(transportBrutto)} PLN</span>
    </div>`
  })() : ''

  const cbmBlock = totals.totalCbm > 0 ? `<div style="display:flex; justify-content:space-between; font-size:11px; color:${MUTED}; margin-bottom:6px;">
    <span>Całkowita objętość zamówienia:</span><span>${fmtPlnHtml(totals.totalCbm)} m³</span>
  </div>` : ''

  return `
    <div style="position:relative; overflow:hidden; border-radius:14px; padding:34px 30px; margin-bottom:24px; color:#fff; background:radial-gradient(circle at 85% 0%, ${GOLD_LIGHT}33, transparent 60%), linear-gradient(120deg, ${NAVY} 0%, ${NAVY2} 55%, ${NAVY} 100%);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:34px;" />` : `<div style="font-size:20px; font-weight:800;">MyChinaPal</div>`}
        <div style="text-align:right;">
          <div style="font-size:19px; font-weight:800; letter-spacing:.04em;">WYCENA</div>
          <div style="font-size:11.5px; color:${GOLD_LIGHT}; margin-top:2px;">${escapeHtml(quote?.quote_number || '')}</div>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; font-size:11px; color:${MUTED}; margin-bottom:18px;">
      <span>Data: ${quote?.created_at ? new Date(quote.created_at).toLocaleDateString('pl-PL') : ''}</span>
      ${quote?.valid_until ? `<span>Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}</span>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; margin-bottom:22px;">
      <tr>
        <td style="width:50%; vertical-align:top; padding:12px; background:#F7F8FA; border-radius:10px 0 0 10px;">
          <div style="font-size:10.5px; font-weight:700; color:${NAVY}; letter-spacing:.04em; margin-bottom:6px;">SPRZEDAWCA</div>
          ${sellerLines.map(l => `<div style="font-size:11px; color:${TEXT};">${escapeHtml(l)}</div>`).join('')}
        </td>
        <td style="width:50%; vertical-align:top; padding:12px; background:#F7F8FA; border-radius:0 10px 10px 0; border-left:1px solid #fff;">
          <div style="font-size:10.5px; font-weight:700; color:${NAVY}; letter-spacing:.04em; margin-bottom:6px;">NABYWCA</div>
          ${buyerLines.map(l => `<div style="font-size:11px; color:${TEXT};">${escapeHtml(l)}</div>`).join('')}
        </td>
      </tr>
    </table>

    <div style="font-size:12px; font-weight:700; color:${NAVY}; letter-spacing:.04em; margin-bottom:10px;">POZYCJE</div>
    ${itemsHtml}

    <div style="border-top:2px solid ${NAVY}; margin-top:10px; padding-top:14px;">
      ${transportBlock}
      ${cbmBlock}
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;"><span>Netto:</span><span>${fmtPlnHtml(totals.finalPrice)} PLN</span></div>
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:10px;"><span>VAT (23%):</span><span>${fmtPlnHtml(totals.vatAmount)} PLN</span></div>
      <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800;"><span>RAZEM BRUTTO:</span><span style="color:${GOLD};">${fmtPlnHtml(totals.finalPriceGross)} PLN</span></div>
    </div>

    ${notes ? `<div style="margin-top:22px;">
      <div style="font-size:11px; font-weight:700; color:${NAVY}; margin-bottom:6px;">Warunki</div>
      <div style="font-size:10.5px; color:${TEXT}; white-space:pre-line;">${escapeHtml(notes)}</div>
    </div>` : ''}

    ${company?.company_bank_account ? `<div style="margin-top:14px; font-size:10.5px; color:${MUTED};">Nr konta: ${escapeHtml(company.company_bank_account)}</div>` : ''}
  `
}
