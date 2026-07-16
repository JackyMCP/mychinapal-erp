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
//
// Wygląd (ta wersja): pełny redesign wizualny w stylu premium B2B ofert —
// tabela pozycji z nagłówkiem kolumn (Lp./Produkt/Ilość/Cena netto za
// sztukę/Wartość netto — każda pozycja ZAWSZE pokazuje obie ceny, niezależnie
// od ilości sztuk), wydzielona "karta" podsumowania kwot (jak w nowoczesnych
// fakturach/checkoutach), spójna typografia (Syne na nagłówkach, Inter na
// treści — te same fonty co reszta aplikacji), więcej oddechu/marginesów,
// subtelne obramowania zamiast ciężkich linii.
export async function loadLogoDataUrl() {
  return fetchAsDataUrl('/logo-white.png')
}

const NAVY = '#0A1628'
const NAVY2 = '#132A4A'
const GOLD = '#B48C28'
const GOLD_LIGHT = '#D4AF5A'
const TEXT = '#141414'
const MUTED = '#64748B'
const BORDER = '#E5E7EB'
const BG_SOFT = '#F7F8FA'
const SERIF_HEAD = "'Syne', sans-serif"
const SANS = "'Inter', -apple-system, sans-serif"

export function fmtPlnHtml(n) {
  return Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function pill({ icon, label, tone = 'light' }) {
  const dark = tone === 'dark'
  return `<div style="display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:20px; background:${dark ? 'rgba(255,255,255,.08)' : BG_SOFT}; border:1px solid ${dark ? 'rgba(255,255,255,.18)' : BORDER}; font-size:11px; font-family:${SANS}; color:${dark ? '#fff' : MUTED}; font-weight:500;">
    <span>${icon}</span><span>${label}</span>
  </div>`
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

  // Tabela pozycji z jawnym nagłówkiem kolumn — dokładnie tak wygląda
  // profesjonalna wycena/oferta handlowa (Lp. / Produkt / Ilość / Cena
  // netto za sztukę / Wartość netto). Dzięki nagłówkowi cena jednostkowa
  // jest NIE DO PRZEOCZENIA — ma własną, podpisaną kolumnę — zamiast być
  // drobnym dopiskiem obok ceny końcowej. Działa identycznie dla 1 pozycji
  // z ilością 30 szt. i dla 20 osobnych pozycji z importu Excela.
  const itemRows = (rows || []).map((r, idx) => {
    const photos = photoDataUrls[r._key] || []
    const cover = photos[0]
    const extra = photos.slice(1, 4)
    const metaBits = []
    if (r.production_days) metaBits.push(`🕓 Produkcja: ${r.production_days} dni`)
    if (r.weight_kg) metaBits.push(`⚖️ Waga: ${r.weight_kg} kg`)
    if (r.cbm) metaBits.push(`📐 CBM: ${r.cbm} m³`)
    else if (r.container_note) metaBits.push(escapeHtml(r.container_note))
    const qtyNum = toNum(r.qty)
    const unitNetto = qtyNum > 0 ? r.finalPrice / qtyNum : r.finalPrice
    const isLast = idx === (rows || []).length - 1

    return `
      <tr>
        <td style="padding:16px 10px 16px 16px; vertical-align:top; text-align:center; border-bottom:${isLast ? 'none' : `1px solid ${BORDER}`}; width:34px;">
          <div style="font-family:${SERIF_HEAD}; font-size:12px; font-weight:800; color:${MUTED};">${idx + 1}</div>
        </td>
        <td style="padding:16px 14px; vertical-align:top; border-bottom:${isLast ? 'none' : `1px solid ${BORDER}`};">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <div style="flex-shrink:0;">
              ${cover
                ? `<img src="${cover}" style="width:88px;height:88px;object-fit:cover;border-radius:10px;border:1px solid ${BORDER};display:block;" />`
                : `<div style="width:88px;height:88px;border-radius:10px;background:${BG_SOFT};border:1px solid ${BORDER};"></div>`}
              ${extra.length ? `<div style="margin-top:6px; display:flex; gap:4px;">${extra.map(p => `<img src="${p}" style="width:19px;height:19px;object-fit:cover;border-radius:4px;border:1px solid ${BORDER};" />`).join('')}</div>` : ''}
            </div>
            <div style="min-width:0; padding-top:2px;">
              <div style="font-family:${SANS}; font-size:13.5px; font-weight:700; color:${TEXT}; line-height:1.4;">${escapeHtml(r.name || '—')}</div>
              ${r.specification ? `<div style="font-family:${SANS}; font-size:11px; color:${MUTED}; margin-top:5px; line-height:1.55;">${escapeHtml(r.specification)}</div>` : ''}
              ${metaBits.length ? `<div style="font-family:${SANS}; font-size:10.5px; color:${MUTED}; margin-top:7px; display:flex; gap:12px; flex-wrap:wrap;">${metaBits.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="padding:16px 10px; vertical-align:top; text-align:center; white-space:nowrap; border-bottom:${isLast ? 'none' : `1px solid ${BORDER}`};">
          <div style="font-family:${SANS}; font-size:12.5px; font-weight:600; color:${TEXT};">${r.qty}</div>
          <div style="font-family:${SANS}; font-size:10px; color:${MUTED}; margin-top:1px;">${escapeHtml(r.unit || '')}</div>
        </td>
        <td style="padding:16px 10px; vertical-align:top; text-align:right; white-space:nowrap; border-bottom:${isLast ? 'none' : `1px solid ${BORDER}`};">
          <div style="font-family:${SANS}; font-size:12.5px; font-weight:600; color:${TEXT};">${fmtPlnHtml(unitNetto)}</div>
          <div style="font-family:${SANS}; font-size:9.5px; color:${MUTED}; margin-top:1px;">PLN / szt.</div>
        </td>
        <td style="padding:16px 16px 16px 10px; vertical-align:top; text-align:right; white-space:nowrap; border-bottom:${isLast ? 'none' : `1px solid ${BORDER}`};">
          <div style="font-family:${SERIF_HEAD}; font-size:15px; font-weight:800; color:${GOLD};">${fmtPlnHtml(r.finalPrice)}</div>
          <div style="font-family:${SANS}; font-size:9.5px; color:${MUTED}; margin-top:1px;">PLN netto</div>
        </td>
      </tr>`
  }).join('')

  const colHeaderStyle = `padding:12px 10px; font-family:${SANS}; font-size:9.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:${GOLD_LIGHT};`

  const itemsTable = `
    <div style="border:1px solid ${BORDER}; border-radius:14px; overflow:hidden;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:${NAVY};">
            <th style="${colHeaderStyle} text-align:center; width:34px; padding-left:16px;">Lp.</th>
            <th style="${colHeaderStyle} text-align:left;">Produkt</th>
            <th style="${colHeaderStyle} text-align:center; white-space:nowrap;">Ilość</th>
            <th style="${colHeaderStyle} text-align:right; white-space:nowrap;">Cena netto / szt.</th>
            <th style="${colHeaderStyle} text-align:right; white-space:nowrap; padding-right:16px;">Wartość netto</th>
          </tr>
        </thead>
        <tbody style="background:#fff;">
          ${itemRows}
        </tbody>
      </table>
    </div>`

  const transportRow = (totals.transportShare > 0 && totals.landedCost > 0) ? (() => {
    const scale = totals.finalPrice / totals.landedCost
    const transportNetto = totals.transportShare * scale
    const transportBrutto = transportNetto * (1 + (totals.vatAmount / (totals.finalPrice || 1)))
    return `<div style="display:flex; justify-content:space-between; font-family:${SANS}; font-size:11px; color:${MUTED}; padding:5px 0;">
      <span>w tym transport (netto / brutto)</span><span>${fmtPlnHtml(transportNetto)} / ${fmtPlnHtml(transportBrutto)} PLN</span>
    </div>`
  })() : ''

  const cbmRow = totals.totalCbm > 0 ? `<div style="display:flex; justify-content:space-between; font-family:${SANS}; font-size:11px; color:${MUTED}; padding:5px 0;">
    <span>Całkowita objętość zamówienia</span><span>${fmtPlnHtml(totals.totalCbm)} m³</span>
  </div>` : ''

  const summaryCard = `
    <div style="display:flex; justify-content:flex-end; margin-top:24px;">
      <div style="width:100%; max-width:360px; background:${BG_SOFT}; border:1px solid ${BORDER}; border-radius:14px; padding:18px 20px 20px;">
        ${transportRow}
        ${cbmRow}
        <div style="display:flex; justify-content:space-between; font-family:${SANS}; font-size:12.5px; color:${TEXT}; padding:6px 0;">
          <span>Netto</span><span style="font-weight:600;">${fmtPlnHtml(totals.finalPrice)} PLN</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-family:${SANS}; font-size:12.5px; color:${MUTED}; padding:6px 0; border-bottom:1px solid ${BORDER}; margin-bottom:12px;">
          <span>VAT (23%)</span><span>${fmtPlnHtml(totals.vatAmount)} PLN</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-radius:11px; background:linear-gradient(120deg, ${NAVY} 0%, ${NAVY2} 100%);">
          <span style="font-family:${SANS}; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#fff;">Razem brutto</span>
          <span style="font-family:${SERIF_HEAD}; font-size:19px; font-weight:800; color:${GOLD_LIGHT};">${fmtPlnHtml(totals.finalPriceGross)} PLN</span>
        </div>
      </div>
    </div>`

  const itemCount = (rows || []).length

  return `
    <div style="font-family:${SANS}; color:${TEXT};">
      <div style="position:relative; overflow:hidden; border-radius:16px; padding:38px 36px; margin-bottom:26px; color:#fff; background:radial-gradient(circle at 88% -10%, ${GOLD_LIGHT}40, transparent 55%), linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 60%, ${NAVY} 100%);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:36px;" />` : `<div style="font-family:${SERIF_HEAD}; font-size:21px; font-weight:800;">MyChinaPal</div>`}
          <div style="text-align:right;">
            ${pill({ icon: '📄', label: 'WYCENA', tone: 'dark' })}
            <div style="font-family:${SERIF_HEAD}; font-size:23px; font-weight:800; margin-top:12px; letter-spacing:.01em;">${escapeHtml(quote?.quote_number || '')}</div>
          </div>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:22px; flex-wrap:wrap;">
        ${quote?.created_at ? pill({ icon: '📅', label: `Data: ${new Date(quote.created_at).toLocaleDateString('pl-PL')}` }) : ''}
        ${quote?.valid_until ? pill({ icon: '⏳', label: `Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}` }) : ''}
        ${pill({ icon: '📦', label: `${itemCount} ${itemCount === 1 ? 'pozycja' : 'pozycji'}` })}
      </div>

      <div style="display:flex; gap:14px; margin-bottom:22px;">
        <div style="flex:1; min-width:0; padding:16px 18px; background:${BG_SOFT}; border:1px solid ${BORDER}; border-radius:12px;">
          <div style="font-family:${SANS}; font-size:10px; font-weight:700; color:${NAVY}; letter-spacing:.08em; text-transform:uppercase; margin-bottom:9px;">🏢 Sprzedawca</div>
          ${sellerLines.map((l, i) => `<div style="font-family:${SANS}; font-size:11.5px; color:${i === 0 ? TEXT : MUTED}; font-weight:${i === 0 ? 700 : 400}; line-height:1.7;">${escapeHtml(l)}</div>`).join('')}
        </div>
        <div style="flex:1; min-width:0; padding:16px 18px; background:${BG_SOFT}; border:1px solid ${BORDER}; border-radius:12px;">
          <div style="font-family:${SANS}; font-size:10px; font-weight:700; color:${NAVY}; letter-spacing:.08em; text-transform:uppercase; margin-bottom:9px;">🧾 Nabywca</div>
          ${buyerLines.map((l, i) => `<div style="font-family:${SANS}; font-size:11.5px; color:${i === 0 ? TEXT : MUTED}; font-weight:${i === 0 ? 700 : 400}; line-height:1.7;">${escapeHtml(l)}</div>`).join('')}
        </div>
      </div>

      <div style="font-family:${SERIF_HEAD}; font-size:13px; font-weight:800; color:${NAVY}; letter-spacing:.02em; margin-bottom:12px;">Pozycje wyceny</div>
      ${itemsTable}

      ${summaryCard}

      ${notes ? `<div style="margin-top:26px; padding:16px 20px; background:${BG_SOFT}; border-left:3px solid ${GOLD}; border-radius:0 12px 12px 0;">
        <div style="font-family:${SANS}; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:${NAVY}; margin-bottom:8px;">Warunki</div>
        <div style="font-family:${SANS}; font-size:11px; color:${TEXT}; white-space:pre-line; line-height:1.75;">${escapeHtml(notes)}</div>
      </div>` : ''}

      <div style="margin-top:22px; padding-top:16px; border-top:1px solid ${BORDER}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="font-family:${SANS}; font-size:10px; color:${MUTED};">
          ${company?.company_bank_account ? `Nr konta: ${escapeHtml(company.company_bank_account)}` : ''}
        </div>
        <div style="font-family:${SANS}; font-size:9.5px; color:${MUTED};">Wycena wystawiona elektronicznie — ważna bez podpisu.</div>
      </div>
    </div>
  `
}
