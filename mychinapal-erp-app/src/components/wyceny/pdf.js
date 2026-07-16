import jsPDF from 'jspdf'

export const navy = [10, 22, 40]
export const gold = [180, 140, 40]
export const goldLight = [212, 175, 90]

export async function fetchAsDataUrl(url) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
  } catch { return null }
}

function arrayBufferToBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// jsPDF wbudowane fonty (helvetica/times/courier) obsługują TYLKO kodowanie
// WinAnsi — nie ma w nim polskich znaków diakrytycznych (ą ć ę ł ń ó ś ź ż).
// Efekt: te litery znikały/mieszały się z otoczeniem, a jsPDF przy liczeniu
// szerokości nierozpoznanych znaków potrafi rozjechać cały tekst na
// pojedyncze, odklejone od siebie litery — to był realny powód zgłoszenia
// "napisy są rozciągnięte/ścieśnięte". Rozwiązanie: osadzamy Liberation Sans
// (darmowa, licencja SIL OFL, metrycznie zgodna z Arial/Helvetica — więc
// wszystkie dotychczasowe obliczenia szerokości/zawijania tekstu zostają
// bez zmian), która ma pełne pokrycie polskich znaków.
let fontsLoadedPromise = null
export async function loadCustomFont(doc) {
  if (!fontsLoadedPromise) {
    fontsLoadedPromise = (async () => {
      try {
        const [regularBuf, boldBuf] = await Promise.all([
          fetch('/fonts/LiberationSans-Regular.ttf').then(r => { if (!r.ok) throw new Error('font fetch failed'); return r.arrayBuffer() }),
          fetch('/fonts/LiberationSans-Bold.ttf').then(r => { if (!r.ok) throw new Error('font fetch failed'); return r.arrayBuffer() }),
        ])
        return { regular: arrayBufferToBase64(regularBuf), bold: arrayBufferToBase64(boldBuf) }
      } catch {
        return null // brak fontu -> bezpieczny fallback do 'helvetica' (bez polskich znaków, ale PDF wciąż się wygeneruje)
      }
    })()
  }
  const fonts = await fontsLoadedPromise
  if (!fonts) return 'helvetica'
  doc.addFileToVFS('LiberationSans-Regular.ttf', fonts.regular)
  doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal')
  doc.addFileToVFS('LiberationSans-Bold.ttf', fonts.bold)
  doc.addFont('LiberationSans-Bold.ttf', 'LiberationSans', 'bold')
  return 'LiberationSans'
}

// Wczytuje obrazek do przeglądarki tylko po to, żeby poznać jego naturalne
// proporcje (naturalWidth/naturalHeight) — bez tego jsPDF rysuje logo w
// sztywnym prostokącie (np. 40×16mm), co przy nie-kwadratowym logo je
// rozciąga/ściska. Znając proporcje, dopasowujemy rozmiar tak, żeby logo się
// nie zniekształcało.
export function loadImageSize(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return }
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

// Format kwoty w stylu polskim (spacja jako separator tysięcy, przecinek
// jako separator dziesiętny) — poprzedni format en-US ("1,780.00") bywał
// mylony z zapisem "1.780,00" albo odczytywany jako znacznie większa kwota,
// stąd zgłoszenie że suma "wygląda jak miliony".
export function fmtPln(n) {
  return Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Generuje branded PDF wyceny dla klienta — wyłącznie cena końcowa (bez
// rozbicia na koszt towaru/transport/cło/marżę, które widzi tylko zespół
// wewnętrzny w aplikacji, z wyjątkiem transportu, który pokazujemy jako
// osobną, orientacyjną pozycję na życzenie).
export async function generateQuotePdf({ quote, client, contact, company, rows, totals, photoDataUrls = {} }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 14
  const right = 196
  const pageBottom = 278
  const FONT = await loadCustomFont(doc)

  const logo = await fetchAsDataUrl('/logo-white.png')
  const logoDims = await loadImageSize(logo)

  // Cienki pasek nagłówkowy powtarzany na KAŻDEJ kolejnej stronie (poza
  // pierwszą, która ma pełny, duży branded nagłówek) — przy wielu pozycjach
  // wycena rozkłada się na kilka stron i bez tego dalsze strony byłyby "gołe",
  // bez żadnej marki/numeru wyceny, co wyglądałoby niespójnie.
  const drawContinuationHeader = () => {
    doc.setFillColor(...navy)
    doc.rect(0, 0, 210, 12, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.text('MyChinaPal', left, 8)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...goldLight)
    doc.text(`${String(quote.quote_number || '')} — cd. / continued`, right, 8, { align: 'right' })
    doc.setTextColor(20, 20, 20)
    return 20
  }

  // Dodaje nową stronę + cienki nagłówek ciągłości, zwraca nowe `y`, od
  // którego bezpiecznie można dalej rysować.
  const addContinuationPage = () => {
    doc.addPage()
    return drawContinuationHeader()
  }

  // Upewnia się, że poniżej bieżącego `y` jest miejsce na `neededH` mm — jeśli
  // nie, dodaje nową stronę (z nagłówkiem ciągłości) i zwraca zaktualizowane
  // `y`. Używane konsekwentnie w całym dokumencie (pozycje towaru, sekcja
  // podsumowania, objaśnienia), żeby żaden fragment nie "przecinał się" na
  // granicy strony w połowie linii.
  const ensureSpace = (currentY, neededH) => {
    if (currentY + neededH > pageBottom) return addContinuationPage()
    return currentY
  }

  // --- Nagłówek: granatowe tło + delikatna złota "poświata" w rogu (kilka
  // nakładających się, półprzezroczystych pasów — bezpieczne w jsPDF, bez
  // ryzyka wyjścia poza nagłówek, w przeciwieństwie do okręgów). ---
  doc.setFillColor(...navy)
  doc.rect(0, 0, 210, 28, 'F')
  try {
    const GState = doc.GState
    if (GState) {
      for (let i = 0; i < 6; i++) {
        doc.setGState(new GState({ opacity: 0.045 }))
        doc.setFillColor(...goldLight)
        doc.rect(210 - (i + 1) * 15, 0, 15, 28, 'F')
      }
      doc.setGState(new GState({ opacity: 1 }))
    }
  } catch { /* poświata to tylko dekoracja — jeśli GState niedostępne, pomijamy bez błędu */ }
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.8)
  doc.line(0, 28, 210, 28)

  if (logo && logoDims) {
    const maxW = 42, maxH = 16
    let w = maxW, h = maxW * (logoDims.h / logoDims.w)
    if (h > maxH) { h = maxH; w = maxH * (logoDims.w / logoDims.h) }
    try { doc.addImage(logo, 'PNG', left, 14 - h / 2, w, h, undefined, 'FAST') } catch { /* ignore malformed image */ }
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont(FONT, 'bold')
  doc.setFontSize(16)
  doc.text('QUOTATION / WYCENA', right, 12, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont(FONT, 'normal')
  doc.setTextColor(...goldLight)
  doc.text(String(quote.quote_number || ''), right, 19, { align: 'right' })

  doc.setTextColor(20, 20, 20)
  let y = 38

  doc.setFont(FONT, 'normal')
  doc.setFontSize(9)
  doc.text(`Date / Data: ${quote.created_at ? new Date(quote.created_at).toLocaleDateString('pl-PL') : ''}`, left, y)
  if (quote.valid_until) doc.text(`Valid until / Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}`, 120, y)
  y += 8

  const colW = 90
  doc.setFillColor(247, 248, 250)
  doc.setDrawColor(230, 232, 236)
  doc.setLineWidth(0.2)
  doc.roundedRect(left, y - 4, colW - 4, 32, 1.5, 1.5, 'FD')
  doc.roundedRect(left + colW, y - 4, colW - 4, 32, 1.5, 1.5, 'FD')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...navy)
  doc.text('SELLER / SPRZEDAWCA', left + 3, y)
  doc.text('BUYER / NABYWCA', left + colW + 3, y)
  doc.setTextColor(20, 20, 20)
  y += 5
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8.5)
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
  const maxLines = Math.max(sellerLines.length, buyerLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) doc.text(doc.splitTextToSize(sellerLines[i], colW - 9), left + 3, y)
    if (buyerLines[i]) doc.text(doc.splitTextToSize(buyerLines[i], colW - 9), left + colW + 3, y)
    y += 4.2
  }
  y += 8

  // --- Pozycje towaru — każda jako osobny blok z DUŻYM zdjęciem (okładka +
  // do 3 miniatur), nazwą, specyfikacją, ilością i ceną końcową. Wysokość
  // bloku liczona jest DYNAMICZNIE na podstawie realnej ilości linii tekstu
  // (nazwa I specyfikacja są teraz zawijane — wcześniej tylko specyfikacja
  // była zawijana, więc długa nazwa towaru potrafiła "wyjechać" poza blok i
  // wyglądać jak ucięta). ---
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text('ITEMS / POZYCJE TOWARU', left, y)
  doc.setTextColor(20, 20, 20)
  y += 6

  const photoSize = 42
  const thumbSize = 11
  const textX = left + photoSize + 10
  const textWidth = right - textX - 3

  for (const [idx, r] of rows.entries()) {
    const photos = photoDataUrls[r._key] || []
    const cover = photos[0]
    const extraPhotos = photos.slice(1, 4) // do 3 dodatkowych miniatur pod okładką
    const hasExtra = extraPhotos.length > 0

    const nameLines = doc.splitTextToSize(r.name || '—', textWidth)
    const specLines = r.specification ? doc.splitTextToSize(r.specification, textWidth) : []

    const nameBlockH = nameLines.length * 5.2
    const specBlockH = specLines.length ? specLines.length * 3.8 + 2 : 0
    const textContentH = 7 + nameBlockH + specBlockH // 7mm górny margines przed nazwą
    const metaAndPriceH = 15 // miejsce na linię ilość/waga/CBM + cenę
    const photoBlockH = photoSize + 6 + (hasExtra ? thumbSize + 4 : 0)
    const blockHeight = Math.max(photoBlockH, textContentH + metaAndPriceH)

    // Przy WIELU pozycjach (np. 20) wycena musi się rozłożyć na tyle stron,
    // ile potrzeba — tyle produktów na stronę, ile faktycznie się zmieści
    // (krótszy opis = więcej pozycji, dłuższy = mniej), każda karta zawsze w
    // całości widoczna, nigdy nie przecięta granicą strony.
    const beforeY = y
    y = ensureSpace(y, blockHeight)
    if (y !== beforeY && idx > 0) {
      // Nowa strona w trakcie listy pozycji — powtórz etykietę sekcji, żeby
      // dalsze strony nie wyglądały jak "oderwane" od reszty wyceny.
      doc.setFont(FONT, 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...navy)
      doc.text('ITEMS / POZYCJE TOWARU (cd. / continued)', left, y - 5)
      doc.setTextColor(20, 20, 20)
    }

    doc.setDrawColor(225, 227, 231)
    doc.setLineWidth(0.3)
    doc.roundedRect(left, y, right - left, blockHeight, 1.2, 1.2)

    if (cover) {
      try { doc.addImage(cover, 'JPEG', left + 3, y + 3, photoSize, photoSize, undefined, 'FAST') } catch { /* ignore malformed image */ }
    } else {
      doc.setFillColor(247, 248, 250)
      doc.setDrawColor(215, 215, 215)
      doc.setLineWidth(0.3)
      doc.roundedRect(left + 3, y + 3, photoSize, photoSize, 1.2, 1.2, 'FD')
    }

    if (hasExtra) {
      let tx = left + 3
      const ty2 = y + 3 + photoSize + 2
      for (const ex of extraPhotos) {
        try { doc.addImage(ex, 'JPEG', tx, ty2, thumbSize, thumbSize, undefined, 'FAST') } catch { /* ignore malformed image */ }
        tx += thumbSize + 2
      }
    }

    let ty = y + 7
    doc.setFont(FONT, 'bold')
    doc.setFontSize(11)
    doc.setTextColor(20, 20, 20)
    doc.text(nameLines, textX, ty)
    ty += nameBlockH

    if (specLines.length) {
      doc.setFont(FONT, 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(100, 100, 100)
      doc.text(specLines, textX, ty)
      ty += specBlockH
      doc.setTextColor(20, 20, 20)
    }

    doc.setFont(FONT, 'normal')
    doc.setFontSize(8.5)
    const metaBits = [`Qty / Ilość: ${r.qty} ${r.unit || ''}`]
    if (r.production_days) metaBits.push(`Production / Produkcja: ${r.production_days} d`)
    if (r.weight_kg) metaBits.push(`Weight / Waga: ${r.weight_kg} kg`)
    if (r.cbm) metaBits.push(`CBM: ${r.cbm} m³`)
    else if (r.container_note) metaBits.push(r.container_note)
    doc.text(metaBits.join('   ·   '), textX, y + blockHeight - 14)

    doc.setFont(FONT, 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...gold)
    doc.text(`${fmtPln(r.finalPrice)} PLN`, right - 3, y + blockHeight - 6, { align: 'right' })
    doc.setTextColor(20, 20, 20)

    y += blockHeight + 4
  }

  // Blok podsumowania (linia + ew. transport + netto/VAT/brutto) trzymamy
  // razem, na jednej stronie — rezerwujemy z zapasem miejsce na wszystkie
  // jego elementy naraz, żeby suma nigdy nie została "rozcięta" u dołu strony.
  const summaryBlockH = 4 + 7 + (totals.transportShare > 0 && totals.landedCost > 0 ? 7 : 0) + (totals.totalCbm > 0 ? 7 : 0) + 6 + 8 + 6
  y = ensureSpace(y, summaryBlockH)
  y += 4
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.4)
  doc.line(left, y, right, y)
  y += 7

  // Transport jako osobna, orientacyjna pozycja (proporcjonalny udział w
  // cenie netto/brutto — transport sam w sobie nie ma osobnej marży/VAT,
  // wliczony jest w cenę towaru, ale klient widzi wprost ile z niej to
  // koszt transportu).
  if (totals.transportShare > 0 && totals.landedCost > 0) {
    const scale = totals.finalPrice / totals.landedCost
    const transportNetto = totals.transportShare * scale
    const transportBrutto = transportNetto * (1 + (totals.vatAmount / (totals.finalPrice || 1)))
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text('w tym transport / incl. transport (netto/brutto):', left, y)
    doc.text(`${fmtPln(transportNetto)} / ${fmtPln(transportBrutto)} PLN`, right, y, { align: 'right' })
    doc.setTextColor(20, 20, 20)
    y += 7
  }

  if (totals.totalCbm > 0) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text('Total volume / Całkowita objętość zamówienia:', left, y)
    doc.text(`${fmtPln(totals.totalCbm)} m³`, right, y, { align: 'right' })
    doc.setTextColor(20, 20, 20)
    y += 7
  }

  doc.setFont(FONT, 'normal')
  doc.setFontSize(10)
  doc.text('Netto:', left, y)
  doc.text(`${fmtPln(totals.finalPrice)} PLN`, right, y, { align: 'right' })
  y += 6
  doc.text('VAT (23%):', left, y)
  doc.text(`${fmtPln(totals.vatAmount)} PLN`, right, y, { align: 'right' })
  y += 8

  doc.setFont(FONT, 'bold')
  doc.setFontSize(12)
  doc.text('TOTAL / RAZEM BRUTTO:', left, y)
  doc.setTextColor(...gold)
  doc.text(`${fmtPln(totals.finalPriceGross)} PLN`, right, y, { align: 'right' })
  doc.setTextColor(20, 20, 20)
  y += 6

  // UWAGA: tu NIGDY nie wolno drukować ceny bazowej/kosztu zespołu chińskiego
  // (auxPrice) — to jest dokument dla klienta. Cena bazowa CNY jest widoczna
  // wyłącznie wewnętrznie, w edytorze wyceny (zespół PL/CN), nie na PDF.
  y += 6

  if (quote.notes) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(quote.notes, right - left)
    // Objaśnienia bywają długie (kilka-kilkanaście linijek warunków) — jeśli
    // nie mieszczą się do końca strony, lepiej przenieść całość na kolejną
    // niż uciąć w połowie zdania.
    const notesH = 5 + lines.length * 3.6 + 6
    y = ensureSpace(y, notesH)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.text('Explanation / Objaśnienia:', left, y)
    y += 5
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.text(lines, left, y)
    y += lines.length * 3.6 + 6
  }

  if (company?.company_bank_account) {
    y = ensureSpace(y, 8)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8.5)
    doc.text(`Bank account / Nr konta: ${company.company_bank_account}`, left, y)
  }

  // Numeracja stron i stopka z zastrzeżeniem — na KAŻDEJ stronie, nie tylko
  // ostatniej, żeby wielostronicowa wycena była spójna i łatwo się w niej
  // odnaleźć (np. przy druku).
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(140, 140, 140)
    doc.text('This quotation is issued electronically by MyChinaPal ERP and is valid without signature.', left, 290)
    doc.text(`${quote.quote_number || ''} — Strona / Page ${p} / ${totalPages}`, right, 290, { align: 'right' })
  }

  return doc.output('blob')
}
