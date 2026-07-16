import jsPDF from 'jspdf'
import { fetchAsDataUrl, loadCustomFont, loadImageSize, fmtPln, navy, gold, goldLight } from './pdf'

// Generuje PDF wyceny na podstawie `layout_json` zapisanego przez wizualny
// edytor wyglądu ("jak Canva") — QuoteLayoutEditor.jsx. Zamiast sztywnego,
// zakodowanego na stałe szablonu (patrz pdf.js — nadal używany, gdy
// quote.layout_json jest puste, dla wstecznej zgodności ze starymi
// wycenami), rysuje dokładnie te elementy i w tych stylach, które
// użytkownik ułożył w edytorze.
//
// Model pozycjonowania: każdy element ma zapisaną pozycję (x,y) w mm na
// stronie A4 — TAK JAK w edytorze Canva, elementy są "przypięte" do
// konkretnego miejsca na stronie. Wyjątek to blok pozycji towaru
// (itemsTable) — jego wysokość zależy od liczby i długości pozycji, więc
// on jeden PAGINUJE (dokłada kolejne strony), a wszystkie elementy które w
// domyślnym układzie znajdują się PONIŻEJ niego (np. podsumowanie cen,
// stopka) automatycznie "płyną" za nim (drukują się zaraz po zakończeniu
// listy pozycji, niezależnie na której to wyjdzie stronie) — inaczej przy
// wielostronicowej wycenie ich sztywna pozycja nie miałaby sensu. Elementy
// POWYŻEJ itemsTable (nagłówek, dane sprzedawcy/nabywcy) zawsze zostają na
// pierwszej stronie w miejscu, w którym je ustawiono w edytorze.

const PAGE_BOTTOM = 278
const LEFT = 14
const RIGHT = 196

export function resolveTemplateText(text, ctx) {
  if (!text) return ''
  return String(text)
    .replace(/\{\{quote_number\}\}/g, ctx.quote.quote_number || '')
    .replace(/\{\{date\}\}/g, ctx.quote.created_at ? new Date(ctx.quote.created_at).toLocaleDateString('pl-PL') : '')
    .replace(/\{\{valid_until\}\}/g, ctx.quote.valid_until ? new Date(ctx.quote.valid_until).toLocaleDateString('pl-PL') : '')
    .replace(/\{\{seller_block\}\}/g, ctx.sellerLines.join('\n'))
    .replace(/\{\{buyer_block\}\}/g, ctx.buyerLines.join('\n'))
    .replace(/\{\{notes\}\}/g, ctx.quote.notes || '')
    .replace(/\{\{bank_account\}\}/g, ctx.company?.company_bank_account || '')
}

// Niektóre elementy tekstowe mają sens TYLKO gdy dane źródłowe są faktycznie
// wypełnione (np. "Objaśnienia" gdy quote.notes jest puste, albo numer konta
// gdy nie ma go w Ustawieniach) — dokładnie jak w starym, sztywnym szablonie
// (pdf.js), które pokazywał je warunkowo. Element zostaje w edytorze zawsze
// widoczny (żeby dało się go ustawić z wyprzedzeniem), ale w finalnym PDF-ie
// pomijamy go całkowicie (bez rysowania i bez zajmowania miejsca), jeśli
// warunek nie jest spełniony.
export function elementShouldRender(el, ctx) {
  if (el.showIf === 'notes') return !!ctx.quote?.notes
  if (el.showIf === 'bankAccount') return !!ctx.company?.company_bank_account
  return true
}

function hexToRgb(hex) {
  if (!hex) return [0, 0, 0]
  const m = String(hex).replace('#', '')
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function fontForFamily(el, FONT) {
  // "LiberationSans" to jedyna osadzona czcionka z polskimi znakami — dla
  // pozostałych (helvetica/times/courier) używamy wbudowanych fontów jsPDF
  // (bez polskich znaków, ale użytkownik wybrał je świadomie w edytorze).
  return el.fontFamily === 'LiberationSans' ? FONT : (el.fontFamily || FONT)
}

function drawText(doc, el, ctx, FONT) {
  const text = resolveTemplateText(el.text, ctx)
  if (!text) return
  const font = fontForFamily(el, FONT)
  doc.setFont(font, el.bold ? 'bold' : 'normal')
  doc.setFontSize(el.fontSize || 10)
  const [r, g, b] = hexToRgb(el.color || '#141414')
  doc.setTextColor(r, g, b)
  if (el.bg) {
    const [br, bgc, bb] = hexToRgb(el.bg)
    doc.setFillColor(br, bgc, bb)
    doc.rect(el.x, el.y, el.w, el.h, 'F')
  }
  const lines = String(text).split('\n').flatMap(line => doc.splitTextToSize(line, el.w))
  let ty = el.y + (el.fontSize || 10) * 0.35 + 3
  const align = el.align === 'right' ? 'right' : el.align === 'center' ? 'center' : 'left'
  const tx = align === 'right' ? el.x + el.w : align === 'center' ? el.x + el.w / 2 : el.x
  for (const line of lines) {
    doc.text(line, tx, ty, { align })
    ty += (el.fontSize || 10) * 0.42
  }
}

function drawRect(doc, el) {
  const [r, g, b] = hexToRgb(el.bg || '#F0F0F0')
  doc.setFillColor(r, g, b)
  if (el.opacity !== undefined && el.opacity < 1 && doc.GState) {
    try {
      doc.setGState(new doc.GState({ opacity: el.opacity }))
      doc.roundedRect(el.x, el.y, el.w, el.h, el.radius || 0, el.radius || 0, 'F')
      doc.setGState(new doc.GState({ opacity: 1 }))
      return
    } catch { /* brak GState — rysuj bez przezroczystości */ }
  }
  doc.roundedRect(el.x, el.y, el.w, el.h, el.radius || 0, el.radius || 0, 'F')
}

async function drawImage(doc, el, ctx) {
  const dataUrl = el.src === 'logo' ? ctx.logoDataUrl : (ctx.uploadedImages?.[el.src] || null)
  if (!dataUrl) return
  const dims = await loadImageSize(dataUrl)
  if (!dims) return
  let w = el.w, h = el.w * (dims.h / dims.w)
  if (h > el.h) { h = el.h; w = el.h * (dims.w / dims.h) }
  const ox = el.x + (el.w - w) / 2
  const oy = el.y + (el.h - h) / 2
  try { doc.addImage(dataUrl, 'PNG', ox, oy, w, h, undefined, 'FAST') } catch { /* ignoruj uszkodzony obrazek */ }
}

// Rysuje listę pozycji towaru zaczynając od (x,y), paginując w razie
// potrzeby — analogicznie do pętli w pdf.js, ale sparametryzowane stylem
// zapisanym w elemencie itemsTable.
function drawItemsTable(doc, el, ctx, FONT) {
  const { rows, photoDataUrls } = ctx
  const x = el.x
  const w = el.w
  const right = x + w
  const [cardBgR, cardBgG, cardBgB] = hexToRgb(el.cardBg || '#FFFFFF')
  const [borderR, borderG, borderB] = hexToRgb(el.cardBorder || '#E1E3E7')
  const [priceR, priceG, priceB] = hexToRgb(el.priceColor || '#B48C28')
  const [textR, textG, textB] = hexToRgb(el.textColor || '#141414')
  const [mutedR, mutedG, mutedB] = hexToRgb(el.mutedColor || '#646464')
  const nameFontSize = el.fontSize || 11
  const specFontSize = el.specFontSize || 8.5

  const drawContinuationHeader = () => {
    doc.setFillColor(...navy)
    doc.rect(0, 0, 210, 12, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont(FONT, 'bold'); doc.setFontSize(9)
    doc.text('MyChinaPal', LEFT, 8)
    doc.setFont(FONT, 'normal'); doc.setFontSize(8)
    doc.setTextColor(...goldLight)
    doc.text(`${String(ctx.quote.quote_number || '')} — cd. / continued`, RIGHT, 8, { align: 'right' })
    doc.setTextColor(20, 20, 20)
    return 20
  }
  const addContinuationPage = () => { doc.addPage(); return drawContinuationHeader() }
  const ensureSpace = (currentY, neededH) => (currentY + neededH > PAGE_BOTTOM ? addContinuationPage() : currentY)

  const photoSize = Math.min(42, el.h > 0 ? el.h : 42)
  const thumbSize = 11
  const textX = x + photoSize + 10
  const textWidth = right - textX - 3

  let y = el.y
  for (const [idx, r] of rows.entries()) {
    const photos = photoDataUrls[r._key] || []
    const cover = photos[0]
    const extraPhotos = photos.slice(1, 4)
    const hasExtra = extraPhotos.length > 0

    const nameLines = doc.splitTextToSize(r.name || '—', textWidth)
    const specLines = r.specification ? doc.splitTextToSize(r.specification, textWidth) : []
    const nameBlockH = nameLines.length * (nameFontSize * 0.47)
    const specBlockH = specLines.length ? specLines.length * (specFontSize * 0.45) + 2 : 0
    const textContentH = 7 + nameBlockH + specBlockH
    const metaAndPriceH = 15
    const photoBlockH = photoSize + 6 + (hasExtra ? thumbSize + 4 : 0)
    const blockHeight = Math.max(photoBlockH, textContentH + metaAndPriceH)

    const beforeY = y
    y = ensureSpace(y, blockHeight)
    if (y !== beforeY && idx > 0) {
      doc.setFont(FONT, 'bold'); doc.setFontSize(9); doc.setTextColor(...navy)
      doc.text('ITEMS / POZYCJE TOWARU (cd. / continued)', LEFT, y - 5)
      doc.setTextColor(textR, textG, textB)
    }

    doc.setDrawColor(borderR, borderG, borderB)
    doc.setLineWidth(0.3)
    doc.setFillColor(cardBgR, cardBgG, cardBgB)
    doc.roundedRect(x, y, w, blockHeight, 1.2, 1.2, 'FD')

    if (cover) {
      try { doc.addImage(cover, 'JPEG', x + 3, y + 3, photoSize, photoSize, undefined, 'FAST') } catch { /* ignore */ }
    } else {
      doc.setFillColor(247, 248, 250); doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.3)
      doc.roundedRect(x + 3, y + 3, photoSize, photoSize, 1.2, 1.2, 'FD')
    }
    if (hasExtra) {
      let tx = x + 3
      const ty2 = y + 3 + photoSize + 2
      for (const ex of extraPhotos) {
        try { doc.addImage(ex, 'JPEG', tx, ty2, thumbSize, thumbSize, undefined, 'FAST') } catch { /* ignore */ }
        tx += thumbSize + 2
      }
    }

    let ty = y + 7
    doc.setFont(FONT, 'bold'); doc.setFontSize(nameFontSize); doc.setTextColor(textR, textG, textB)
    doc.text(nameLines, textX, ty)
    ty += nameBlockH
    if (specLines.length) {
      doc.setFont(FONT, 'normal'); doc.setFontSize(specFontSize); doc.setTextColor(mutedR, mutedG, mutedB)
      doc.text(specLines, textX, ty)
      ty += specBlockH
      doc.setTextColor(textR, textG, textB)
    }
    doc.setFont(FONT, 'normal'); doc.setFontSize(8.5)
    const metaBits = [`Qty / Ilość: ${r.qty} ${r.unit || ''}`]
    if (r.production_days) metaBits.push(`Production / Produkcja: ${r.production_days} d`)
    if (r.weight_kg) metaBits.push(`Weight / Waga: ${r.weight_kg} kg`)
    if (r.cbm) metaBits.push(`CBM: ${r.cbm} m³`)
    else if (r.container_note) metaBits.push(r.container_note)
    doc.text(metaBits.join('   ·   '), textX, y + blockHeight - 14)

    doc.setFont(FONT, 'bold'); doc.setFontSize(13); doc.setTextColor(priceR, priceG, priceB)
    doc.text(`${fmtPln(r.finalPrice)} PLN`, right - 3, y + blockHeight - 6, { align: 'right' })
    doc.setTextColor(textR, textG, textB)

    y += blockHeight + 4
  }
  return { y, page: doc.internal.getNumberOfPages(), ensureSpace, drawContinuationHeader: null }
}

function drawSummary(doc, el, ctx, FONT, startY) {
  const { totals } = ctx
  const [r, g, b] = hexToRgb(el.color || '#141414')
  const [totalR, totalG, totalB] = hexToRgb(el.totalColor || '#B48C28')
  const x = el.x, right = el.x + el.w
  let y = startY

  doc.setDrawColor(...navy); doc.setLineWidth(0.4)
  doc.line(x, y, right, y)
  y += 7

  if (totals.transportShare > 0 && totals.landedCost > 0) {
    const scale = totals.finalPrice / totals.landedCost
    const transportNetto = totals.transportShare * scale
    const transportBrutto = transportNetto * (1 + (totals.vatAmount / (totals.finalPrice || 1)))
    doc.setFont(FONT, 'normal'); doc.setFontSize(el.fontSize || 10); doc.setTextColor(90, 90, 90)
    doc.text('w tym transport / incl. transport (netto/brutto):', x, y)
    doc.text(`${fmtPln(transportNetto)} / ${fmtPln(transportBrutto)} PLN`, right, y, { align: 'right' })
    doc.setTextColor(r, g, b)
    y += 7
  }

  doc.setFont(FONT, 'normal'); doc.setFontSize(el.fontSize || 10); doc.setTextColor(r, g, b)
  doc.text('Netto:', x, y); doc.text(`${fmtPln(totals.finalPrice)} PLN`, right, y, { align: 'right' }); y += 6
  doc.text('VAT (23%):', x, y); doc.text(`${fmtPln(totals.vatAmount)} PLN`, right, y, { align: 'right' }); y += 8

  doc.setFont(FONT, 'bold'); doc.setFontSize((el.fontSize || 10) + 2)
  doc.text('TOTAL / RAZEM BRUTTO:', x, y)
  doc.setTextColor(totalR, totalG, totalB)
  doc.text(`${fmtPln(totals.finalPriceGross)} PLN`, right, y, { align: 'right' })
  doc.setTextColor(r, g, b)
  y += 6
  return y
}

// Wspólny kontekst dla podstawień {{...}} i list sprzedawca/nabywca — używany
// zarówno przy generowaniu PDF, jak i przy podglądzie na żywo w edytorze
// (QuoteLayoutEditor), żeby oba miejsca pokazywały DOKŁADNIE ten sam tekst.
export function buildTemplateContext({ quote, client, contact, company, rows, totals, photoDataUrls = {} }) {
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
  return { quote, client, contact, company, rows, totals, photoDataUrls, sellerLines, buyerLines }
}

export async function generateQuotePdfFromLayout({ layout, quote, client, contact, company, rows, totals, photoDataUrls = {}, uploadedImages = {} }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const FONT = await loadCustomFont(doc)
  const logoDataUrl = await fetchAsDataUrl('/logo-white.png')

  const ctx = { ...buildTemplateContext({ quote, client, contact, company, rows, totals, photoDataUrls }), uploadedImages, logoDataUrl }

  const elements = layout?.elements || []
  const itemsTableEl = elements.find(e => e.type === 'itemsTable')
  const staticEls = elements
    .filter(e => e.type !== 'itemsTable' && (!itemsTableEl || e.y < itemsTableEl.y))
    .sort((a, b) => (a.z || 0) - (b.z || 0))
  const flowEls = elements
    .filter(e => e.type !== 'itemsTable' && itemsTableEl && e.y >= itemsTableEl.y)
    .sort((a, b) => (a.y || 0) - (b.y || 0))

  for (const el of staticEls) {
    if (!elementShouldRender(el, ctx)) continue
    if (el.type === 'rect') drawRect(doc, el)
    else if (el.type === 'image') await drawImage(doc, el, ctx)
    else if (el.type === 'text') drawText(doc, el, ctx, FONT)
  }

  let flowY = itemsTableEl ? itemsTableEl.y : 84
  if (itemsTableEl) {
    const result = drawItemsTable(doc, itemsTableEl, ctx, FONT)
    flowY = result.y
  }

  for (const el of flowEls) {
    if (!elementShouldRender(el, ctx)) continue
    if (el.type === 'summary') {
      const summaryH = 4 + 7 + (totals.transportShare > 0 && totals.landedCost > 0 ? 7 : 0) + 6 + 8 + 6
      if (flowY + summaryH > PAGE_BOTTOM) { doc.addPage(); flowY = 20 }
      flowY = drawSummary(doc, el, ctx, FONT, flowY + 4)
    } else if (el.type === 'text') {
      const text = resolveTemplateText(el.text, ctx)
      const lines = text ? doc.splitTextToSize(text, el.w) : []
      const neededH = 5 + lines.length * ((el.fontSize || 8) * 0.5)
      if (flowY + neededH > PAGE_BOTTOM) { doc.addPage(); flowY = 20 }
      drawText(doc, { ...el, y: flowY }, ctx, FONT)
      flowY += neededH
    } else if (el.type === 'rect') {
      drawRect(doc, { ...el, y: flowY })
      flowY += el.h + 2
    } else if (el.type === 'image') {
      await drawImage(doc, { ...el, y: flowY }, ctx)
      flowY += el.h + 2
    }
  }

  // Numeracja stron na KAŻDEJ stronie (system chrome, nie element edytora —
  // sam tekst zastrzeżenia "wystawione elektronicznie..." jest teraz zwykłym,
  // przesuwalnym/edytowalnym elementem tekstowym w layout_json, więc nie
  // duplikujemy go tutaj na sztywno).
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5); doc.setTextColor(140, 140, 140)
    doc.text(`${quote.quote_number || ''} — Strona / Page ${p} / ${totalPages}`, RIGHT, 293, { align: 'right' })
  }

  return doc.output('blob')
}
