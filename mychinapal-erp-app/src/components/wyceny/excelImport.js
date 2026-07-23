import * as XLSX from 'xlsx'
import { toNum } from './calc'
import { supabase } from '../../lib/supabaseClient'

// Pola, na które sztywna mapa nagłówków (HEADER_MAP/APPEND_MAP) potrafi
// dopasować kolumnę — te same nazwy są używane jako enum w edge function
// map-excel-headers (fallback AI dla nagłówków, których reguły nie rozpoznają).
const AI_MAPPABLE_FIELDS = ['name', 'specification', 'qty', 'unit_price_cny', 'cbm', 'weight_kg', 'duty_rate_percent', 'container_note', 'append', 'ignore']

// Import "najlepszego wysiłku" z wyceny fabrycznej w Excelu. Widziane w
// praktyce formaty różnią się bardzo: albo angielskie nagłówki fabryczne
// (Nr. / Picture / Name / Specification / QTY（set）/ EXW Unit Price（CNY/set）
// / EXW Total Price（CNY）/ Volume（CBM）/ EXW Add.), albo już przetłumaczone
// przez zespół PL polskie nagłówki (Nr / Zdjęcie / Nazwa produktu / Opis /
// Ilość（szt.）/ Cena jednostkowa FCA / Cło (%) / Objętość (m³) / Waga
// całkowita (kg) / Informacje o pakowaniu...). Dopasowujemy nagłówki "na
// wyczucie" (małe litery, bez polskich znaków/nawiasów/spacji) zamiast
// wymagać identycznych kolumn — a i tak zawsze wynik trzeba ręcznie
// sprawdzić/uzupełnić przed wysłaniem.
const DIACRITICS_MAP = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }
function foldDiacritics(s) {
  return s.replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS_MAP[ch] || ch)
}
function normalizeHeader(h) {
  return foldDiacritics(String(h || '').toLowerCase()).replace(/[（(].*?[）)]/g, '').replace(/[^a-z]/g, '')
}

// Kolumny, które mapujemy wprost na pola pozycji wyceny — WŁĄCZNIE z ceną
// jednostkową (cena EXW/FCA/FOB towaru od zespołu chińskiego). Wcześniej cena
// celowo nie była importowana (miała być zawsze wpisywana ręcznie) — na
// wyraźną prośbę teraz importuje się automatycznie tak jak reszta pól, wciąż
// w pełni edytowalna przed zapisaniem/wysłaniem wyceny.
const HEADER_MAP = {
  name: 'name', productname: 'name', 品名: 'name', nazwaproduktu: 'name', nazwatowaru: 'name',
  specification: 'specification', spec: 'specification', description: 'specification', desc: 'specification', opis: 'specification',
  qty: 'qty', quantity: 'qty', ilosc: 'qty',
  exwunitprice: 'unit_price_cny', unitprice: 'unit_price_cny', price: 'unit_price_cny',
  volume: 'cbm', cbm: 'cbm', objetosc: 'cbm',
  exwadd: 'container_note', address: 'container_note',
  weightkg: 'weight_kg', wagacalkowita: 'weight_kg', wagacalkowitakg: 'weight_kg',
  clo: 'duty_rate_percent', clostawka: 'duty_rate_percent', dutyrate: 'duty_rate_percent',
}

// Nagłówki cenowe różnią się dopiskiem Incoterms ("Cena jednostkowa FCA",
// "Cena jednostkowa EXW", "EXW Unit Price（CNY/set）"...) — zamiast wypisywać
// każdy wariant z osobna w HEADER_MAP, każdy nagłówek zawierający "cena" +
// "jednostkowa" (albo samo "unitprice"/"exw..price") jest traktowany jako
// cena jednostkowa. Nagłówki oznaczające SUMĘ/wartość całkowitą (np. "Cena
// całkowita", "EXW Total Price") są celowo WYKLUCZONE — zaimportowanie sumy
// jako ceny jednostkowej przemnożyłoby się przez ilość i dało cenę
// wielokrotnie zawyżoną, więc to rozróżnienie jest krytyczne.
function looksLikeUnitPriceHeader(norm) {
  if (/calkowit|total|suma|razem/.test(norm)) return false
  return /cenajednostkowa|unitprice|exw.*price|price.*exw/.test(norm)
}

// Kolumny opisowe, które NIE mają swojego pola w formularzu (szczegóły
// pakowania — rozmiar kartonu, sztuk/karton itd.) — zamiast je gubić,
// doklejamy je jako czytelne, podpisane linijki do specyfikacji, żeby
// wszystko z Excela było widoczne i edytowalne w jednym miejscu.
const APPEND_MAP = {
  informacjeopakowaniu: 'Pakowanie',
  rozmiarkartonu: 'Rozmiar kartonu',
  waga: 'Waga/karton (kg)',
  ilosc: 'Szt./karton', // uwaga: ten sam znormalizowany klucz co główne "Ilość" —
  // w praktyce nieszkodliwe, bo kolumna główna zostaje "zużyta" przez HEADER_MAP
  // (pierwsze dopasowanie wygrywa — patrz pętla niżej) i tylko DRUGIE wystąpienie
  // (np. "Ilość (szt./karton)") trafia tutaj.
  liczbakartonow: 'Liczba kartonów',
}

// Zdjęcia osadzone w Excelu (kolumna "Zdjęcie"/"Picture" itp.) nie są zwykłymi
// wartościami komórek — to osobne obiekty graficzne "przyklejone" do
// konkretnego wiersza/kolumny (anchor). Pakiet `xlsx` (SheetJS, wersja OSS)
// używany do odczytu wartości komórek NIE potrafi ich wyciągnąć. Używamy
// do tego dodatkowo `exceljs`, które wystawia ws.getImages() + surowe bajty
// obrazu (workbook.model.media) — i tylko do tego, żeby nie dublować dwóch
// bibliotek do parsowania samych wartości.
async function extractRowImages(buf, sheetStartRow0) {
  const byRowIdx = {}
  try {
    // Import dynamiczny — `exceljs` jest ciężką biblioteką (~1MB), a potrzebna
    // jest wyłącznie tutaj, przy imporcie z Excela. Dzięki temu nie obciąża
    // głównego bundla ładowanego przy każdym wejściu w aplikację.
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws) return byRowIdx
    const images = ws.getImages ? ws.getImages() : []
    for (const img of images) {
      const media = wb.model?.media?.[img.imageId]
      if (!media?.buffer) continue
      // ExcelJS podaje pozycję kotwicy jako ułamkową pozycję wiersza (0-indeksowaną,
      // np. 2.0457 = "trochę poniżej górnej krawędzi wiersza 3" w Excelu). Samo
      // Math.floor(tl.row) potrafi się mylić o jeden wiersz, gdy zdjęcie jest
      // wstawione z niewielkim przesunięciem w dół względem górnej krawędzi swojego
      // wiersza (częste, gdy dostawca ręcznie przeciągał/wklejał zdjęcia) — wtedy
      // środek obrazka (średnia tl.row i br.row, jeśli br dostępne) trafia bliżej
      // KOLEJNEGO wiersza niż ten, do którego faktycznie należy zdjęcie. Zaokrąglamy
      // więc środek zakresu do najbliższego wiersza zamiast ucinać w dół — to
      // znacznie zmniejsza liczbę zdjęć przypisanych o jeden wiersz za nisko/wysoko.
      const tlRow = img.range?.tl?.row ?? -1
      const brRow = img.range?.br?.row
      const centerRow = brRow !== undefined ? (tlRow + brRow) / 2 : tlRow
      const rowIdx = Math.round(centerRow) - sheetStartRow0
      if (rowIdx < 0) continue
      const ext = String(media.extension || 'png').toLowerCase()
      const mime = ext === 'jpg' ? 'jpeg' : ext
      if (!['png', 'jpeg', 'gif', 'webp', 'bmp'].includes(mime)) continue
      const dataUrl = `data:image/${mime};base64,${arrayBufferToBase64(media.buffer)}`
      if (!byRowIdx[rowIdx]) byRowIdx[rowIdx] = []
      byRowIdx[rowIdx].push(dataUrl)
    }
  } catch {
    // Najlepszy wysiłek — jeśli struktura pliku jest nietypowa i nie da się
    // wyciągnąć zdjęć, import samych danych (nazwa/ilość/cena) i tak ma zadziałać.
  }
  return byRowIdx
}

function arrayBufferToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Niektóre pliki mają dwuwierszowy nagłówek (np. "Informacje o pakowaniu"
// rozbite w drugim wierszu na Rozmiar kartonu / Waga / Ilość/karton / Liczba
// kartonów) — to poniżej wyciąga z Opisu ewentualny "Czas produkcji: N dni",
// żeby dedykowane pole "Czas produkcji" też się uzupełniło, a nie tylko sam
// tekst opisu.
function extractProductionDays(text) {
  const m = String(text || '').match(/czas produkcji\s*[:\-]?\s*(?:ok\.?\s*)?(\d+)/i)
  return m ? m[1] : ''
}

// Wiersz "RAZEM/TOTAL/SUMA" na dole tabeli (podsumowanie zamówienia, nie
// pojedynczy produkt) bywa błędnie importowany jako REALNA pozycja, kiedy ma
// przy sobie jakieś zdjęcie zakotwiczone w pobliżu (np. pieczątka/podpis na
// dole dokumentu) — bo dotychczasowa reguła włączała wiersz bez nazwy, jeśli
// tylko miał obraz (`hasName || rowImages.length`). Realny przykład, który
// wykrył tę wadę: wiersz bez nazwy, z ilością równą SUMIE ilości wszystkich
// wcześniejszych pozycji i wartością w kolumnie CBM równą sumie (cena×ilość)
// wszystkich wcześniejszych pozycji — czyli klasyczny wiersz podsumowania,
// którego "objętość" w rzeczywistości była łączną wartością zamówienia w
// CNY, przypadkowo trafiającą w kolumnę zmapowaną jako CBM. Taki wiersz
// pomijamy CAŁKOWICIE (razem z jego zdjęciem — to prawdopodobnie pieczątka,
// nie zdjęcie produktu), zamiast tworzyć z niego fantomową, bezsensowną
// pozycję (bez nazwy, z absurdalną "objętością").
const TOTAL_ROW_REGEX = /(razem|\btotal\b|grand\s*total|\bsuma\b|lacznie|w sumie|podsumowanie)/i
function looksLikeTotalRowLabel(rawRow) {
  return (rawRow || []).some(c => TOTAL_ROW_REGEX.test(foldDiacritics(String(c ?? '').toLowerCase())))
}

// `extractImages`: wyciąganie zdjęć z Excela (przez ciężką bibliotekę
// ExcelJS — patrz extractRowImages) jest potrzebne TYLKO tam, gdzie zdjęcia
// faktycznie się wyświetlają (podgląd zapisanej wyceny — previewQuoteFile).
// Samo wykrycie łącznej wartości wyceny (detectQuoteValue, wywoływane przy
// KAŻDYM wgraniu pliku, zanim cokolwiek zostanie zapisane) w ogóle nie
// korzysta ze zdjęć — a dla dużych plików z wieloma/dużymi zdjęciami w
// komórkach to wyciąganie potrafi trwać bardzo długo (albo się wysypać),
// przez co wgranie takiego pliku wyglądało na "zawieszone"/nieudane, mimo że
// same dane (ilość/cena) parsują się błyskawicznie. Domyślnie zdjęcia są
// wyciągane (zachowanie jak dotychczas) — wyłączane jawnie tam, gdzie i tak
// nie są używane.
export async function parseQuoteExcel(file, { extractImages = true } = {}) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const sheetStartRow0 = range.s.r

  // Zdjęcia trzeba wyciągnąć z osobnej kopii bufora (ExcelJS konsumuje/czyta
  // go niezależnie od SheetJS) — dopasowywane do wierszy przez pozycję kotwicy.
  const imagesByRowIdx = extractImages ? await extractRowImages(buf.slice(0), sheetStartRow0) : {}

  // Znajdź wiersz nagłówka — pierwszy, który ma JAKĄKOLWIEK komórkę pasującą
  // do znanego nagłówka (nie tylko "name"/"品名" — inaczej plik z samymi
  // polskimi nagłówkami nigdy by go nie znalazł i ucichła by cała reszta
  // dopasowania kolumn).
  let headerRowIdx = rows.findIndex(r => r.some(c => HEADER_MAP[normalizeHeader(c)]))
  if (headerRowIdx === -1) headerRowIdx = 0
  let headerRow = [...rows[headerRowIdx]]
  let dataStartIdx = headerRowIdx + 1

  const buildColMaps = (hRow) => {
    const cMap = {} // colIndex -> nasze pole
    const usedFields = new Set()
    hRow.forEach((h, i) => {
      const norm = normalizeHeader(h)
      let fld = HEADER_MAP[norm]
      if (!fld && looksLikeUnitPriceHeader(norm)) fld = 'unit_price_cny'
      // Pierwsze dopasowanie danego pola wygrywa — niektóre pliki mają DWIE
      // kolumny normalizujące się do tego samego klucza (np. "Ilość（szt.）"
      // ogólna ilość i "Ilość (szt./karton)" w sekcji pakowania — obie tracą
      // nawiasy i wyglądają identycznie). Bez tej reguły druga kolumna po
      // cichu nadpisywałaby poprawną ilość błędną wartością.
      if (fld && !usedFields.has(fld)) { cMap[i] = fld; usedFields.add(fld) }
    })
    // Drugi przebieg — kolumny NIEUŻYTE przez colMap, ale rozpoznane jako
    // szczegóły pakowania/opisowe bez własnego pola — dokleimy je do specyfikacji.
    const aMap = {} // colIndex -> etykieta
    hRow.forEach((h, i) => {
      if (cMap[i]) return
      const norm = normalizeHeader(h)
      if (APPEND_MAP[norm]) aMap[i] = APPEND_MAP[norm]
    })
    return { cMap, aMap }
  }

  let { cMap: colMap, aMap: appendColMap } = buildColMaps(headerRow)

  // Niektóre pliki (np. z sekcją "Informacje o pakowaniu" rozbitą na kilka
  // pod-kolumn) mają DWUWIERSZOWY nagłówek: pierwszy wiersz to główne
  // etykiety, drugi — doprecyzowanie dla kolumn, które w pierwszym wierszu
  // są scalone/puste. Wykrywamy to tak: jeśli mamy rozpoznaną kolumnę "name",
  // a KOLEJNY wiersz ma tam pustą wartość, ale za to ma gdzie indziej tekstowe
  // (nie liczbowe) etykiety — to prawie na pewno kontynuacja nagłówka, a nie
  // dane produktu. Scalamy oba wiersze (brakujące etykiety z wiersza 1
  // uzupełniamy etykietami z wiersza 2) i dopiero wtedy realne dane zaczynają
  // się o wiersz niżej — bez tego cała sekcja pakowania (rozmiar kartonu,
  // sztuk/karton, liczba kartonów) po cichu by zniknęła.
  const nameColIdx = Object.entries(colMap).find(([, f]) => f === 'name')?.[0]
  if (nameColIdx !== undefined) {
    const nextRow = rows[headerRowIdx + 1]
    const nameEmpty = !nextRow?.[Number(nameColIdx)]
    const hasTextLabel = nextRow?.some(c => typeof c === 'string' && c.trim() && Number.isNaN(Number(c.replace(',', '.'))))
    if (nameEmpty && hasTextLabel) {
      const merged = headerRow.map((h, i) => (h ? h : (nextRow[i] ?? '')))
      const rebuilt = buildColMaps(merged)
      headerRow = merged
      colMap = rebuilt.cMap
      appendColMap = rebuilt.aMap
      dataStartIdx = headerRowIdx + 2
    }
  }

  // Kolumny, których sztywna mapa nagłówków (HEADER_MAP/APPEND_MAP/looksLikeUnitPriceHeader)
  // NIE rozpoznała, a mają niepusty tekst nagłówka — to zwykle nietypowa/nowa nazwa
  // kolumny u konkretnego dostawcy (inny język, skrót, literówka). Zamiast po cichu
  // gubić taką kolumnę, prosimy AI (Claude) o dopasowanie na podstawie nagłówka +
  // kilku przykładowych wartości z danych. To NAJLEPSZY WYSIŁEK — jeśli się nie uda
  // (brak sieci, błąd funkcji, AI nie jest pewne), kolumna po prostu zostaje
  // nierozpoznana, dokładnie jak wcześniej.
  const unresolvedCols = []
  headerRow.forEach((h, i) => {
    const headerText = String(h ?? '').trim()
    if (!headerText || colMap[i] || appendColMap[i]) return
    const samples = []
    for (let r = dataStartIdx; r < rows.length && samples.length < 3; r++) {
      const v = rows[r]?.[i]
      if (v !== '' && v !== null && v !== undefined) samples.push(String(v))
    }
    unresolvedCols.push({ index: i, header: headerText, samples })
  })
  if (unresolvedCols.length) {
    try {
      const usedFields = new Set(Object.values(colMap))
      const { data, error } = await supabase.functions.invoke('map-excel-headers', {
        body: { columns: unresolvedCols, allowedFields: AI_MAPPABLE_FIELDS },
      })
      if (!error && data?.mapping) {
        for (const col of unresolvedCols) {
          const guess = data.mapping[String(col.index)]
          if (!guess || guess === 'ignore') continue
          if (guess === 'append') { appendColMap[col.index] = col.header; continue }
          if (AI_MAPPABLE_FIELDS.includes(guess) && !usedFields.has(guess)) {
            colMap[col.index] = guess
            usedFields.add(guess)
          }
        }
      }
    } catch {
      // Najlepszy wysiłek — brak dopasowania AI nie blokuje reszty importu.
    }
  }

  const items = []
  let qtySumSoFar = 0
  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue
    const item = { name: '', specification: '', qty: 1, unit: 'set', unit_price_cny: 0, cbm: '', container_note: '', weight_kg: '', duty_rate_percent: '' }
    let hasName = false
    for (const [colIdx, field] of Object.entries(colMap)) {
      const val = row[Number(colIdx)]
      if (val === '' || val === null || val === undefined) continue
      // Komórki bywają liczbami (Excel) albo tekstem z przecinkiem jako
      // separatorem dziesiętnym (np. "2,7") — zamieniamy przecinek na kropkę
      // przed parsowaniem, żeby Number() nie zwracał po cichu NaN/0.
      const asNumber = (v) => {
        const s = String(v ?? '').trim().replace(',', '.')
        return s === '' ? NaN : Number(s)
      }
      if (field === 'qty' || field === 'unit_price_cny' || field === 'weight_kg' || field === 'duty_rate_percent') item[field] = toNum(val)
      else if (field === 'cbm') { const n = asNumber(val); item.cbm = Number.isNaN(n) ? '' : n; if (Number.isNaN(n)) item.container_note = String(val) }
      else item[field] = String(val)
      if (field === 'name' && item.name) hasName = true
    }

    // Doklej rozpoznane, ale "bezdomne" kolumny (pakowanie itp.) do specyfikacji
    // jako czytelne, podpisane linijki — nic z Excela nie ma zniknąć po cichu.
    const extraLines = []
    for (const [colIdx, labelText] of Object.entries(appendColMap)) {
      const val = row[Number(colIdx)]
      if (val === '' || val === null || val === undefined) continue
      extraLines.push(`${labelText}: ${val}`)
    }
    if (extraLines.length) {
      item.specification = item.specification ? `${item.specification}\n${extraLines.join(', ')}` : extraLines.join(', ')
    }

    const prodDays = extractProductionDays(item.specification)
    if (prodDays) item.production_days = prodDays

    // Wiersz bez nazwy, który ALBO ma etykietę razem/total/suma w jakiejś
    // komórce, ALBO jego ilość dokładnie sumuje się z ilościami wszystkich
    // wcześniejszych, nazwanych pozycji — to wiersz podsumowania zamówienia,
    // nie produkt. Pomijamy go całkowicie (razem z ewentualnym zdjęciem —
    // patrz komentarz przy TOTAL_ROW_REGEX), żeby nie tworzyć fantomowej
    // pozycji z absurdalną "ilością"/"objętością".
    const isTotalRow = !hasName && qtySumSoFar > 0 && (
      looksLikeTotalRowLabel(row) || toNum(item.qty) === qtySumSoFar
    )
    if (isTotalRow) continue

    // Wiersze bez nazwy to poza tym zwykle (przy dwuwierszowym nagłówku)
    // kontynuacja nagłówka — pomijamy je, chyba że wiersz ma za to zdjęcie
    // (produkt bez opisanej nazwy w Excelu, ale z fotką — i tak warto go
    // zaimportować, nazwę można dopisać/dogenerować AI).
    const rowImages = imagesByRowIdx[r] || []
    if (hasName || rowImages.length) {
      if (rowImages.length) item._photoDataUrls = rowImages
      items.push(item)
      if (hasName) qtySumSoFar += toNum(item.qty)
    }
  }
  return items
}
