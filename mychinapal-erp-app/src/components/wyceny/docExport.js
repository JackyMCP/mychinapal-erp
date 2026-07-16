import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// Renderuje podaną treść HTML (zmaterializowany dokument wyceny, edytowany
// bezpośrednio w QuoteDocEditor przez contentEditable) do PDF — zastępuje
// dawny generator pdf.js/pdfFromLayout.js, który rysował PDF ręcznie
// element-po-elemencie. Teraz PDF to po prostu "zdjęcie" aktualnej treści
// dokumentu (tego co widać w edytorze), pocięte na strony A4 — dzięki temu
// klient zawsze dostaje DOKŁADNIE to, co zespół ułożył w dokumencie, łącznie
// z ręcznymi poprawkami tekstu/formatowania.
//
// Inteligentny podział na strony: naiwne cięcie obrazu co dokładnie 297mm
// potrafiło przeciąć pozycję towaru albo linijkę "Warunków" dokładnie w
// połowie (zgłoszone przez użytkownika — szary "szew" strony wypadał w
// środku tekstu). Dlatego przed cięciem szukamy najbliższego "pustego"
// poziomego pasa (jednolite tło, bez tekstu/obrazków) w okolicy idealnej
// granicy strony i tam robimy cięcie — strona nigdy nie urywa się w środku
// linii czy zdjęcia, tylko zawsze w naturalnej przerwie między blokami.
const NAVY = [10, 22, 40]
const GOLD_LIGHT = [212, 175, 90]

function isRowBlank(pixels, y, width) {
  const rowStart = y * width * 4
  for (let x = 0; x < width; x += 4) { // co 4. piksel wystarczy, żeby wykryć tekst/krawędzie
    const i = rowStart + x * 4
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    if (!(r > 248 && g > 248 && b > 248)) return false
  }
  return true
}

// Szuka najbliższego "pustego" wiersza pikseli w oknie [idealY - window, idealY],
// żeby ciąć stronę w naturalnej przerwie między blokami treści zamiast w
// środku tekstu/zdjęcia. Jeśli nic nie znajdzie (np. bardzo długa, gęsta
// tabela bez odstępu), wraca do twardego cięcia na idealnej granicy.
function findSafeBreak(imageData, idealY, window) {
  const { data, width } = imageData
  const minY = Math.max(1, idealY - window)
  for (let y = idealY; y >= minY; y--) {
    if (isRowBlank(data, y, width)) return y
  }
  return idealY
}

function drawContinuationHeader(pdf, label) {
  pdf.setFillColor(...NAVY)
  pdf.rect(0, 0, 210, 11, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.text('MyChinaPal', 12, 7.2)
  if (label) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...GOLD_LIGHT)
    pdf.text(`${label} — cd.`, 198, 7.2, { align: 'right' })
  }
  pdf.setTextColor(20, 20, 20)
}

export async function exportHtmlToPdfBlob(html, { continuationLabel } = {}) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '780px'
  container.style.background = '#ffffff'
  container.style.padding = '28px'
  container.style.boxSizing = 'border-box'
  container.innerHTML = html
  document.body.appendChild(container)
  let blob
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const ctx = canvas.getContext('2d')
    const pageWidthMm = 210
    const pageHeightMm = 297
    const headerH = continuationLabel ? 11 : 0 // mm zarezerwowane na pasek ciągłości na stronach 2+
    const pxPerMm = canvas.width / pageWidthMm
    const fullPageHeightPx = pageHeightMm * pxPerMm
    const contentPageHeightPx = (pageHeightMm - headerH) * pxPerMm
    const searchWindowPx = fullPageHeightPx * 0.15 // do 15% wysokości strony wstecz w poszukiwaniu przerwy

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = 0
    let pageIndex = 0

    while (y < canvas.height - 1) {
      const isFirstPage = pageIndex === 0
      const maxHeightThisPage = isFirstPage ? fullPageHeightPx : contentPageHeightPx
      const idealEnd = Math.min(canvas.height, y + maxHeightThisPage)
      let cut = idealEnd
      if (idealEnd < canvas.height) {
        // Próbkujemy piksele TYLKO raz na potrzebną okolicę cięcia (nie całego
        // canvasu) — getImageData na małym pasie jest tanie nawet dla dużych
        // dokumentów z wieloma stronami.
        const sampleTop = Math.max(0, Math.floor(idealEnd - searchWindowPx))
        const sampleH = Math.ceil(idealEnd) - sampleTop
        const sample = ctx.getImageData(0, sampleTop, canvas.width, sampleH)
        const localIdeal = Math.floor(idealEnd) - sampleTop
        const localCut = findSafeBreak(sample, localIdeal, searchWindowPx)
        cut = sampleTop + localCut
      }
      const sliceHeight = Math.max(1, cut - y)

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceHeight
      sliceCanvas.getContext('2d').drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.94)

      if (!isFirstPage) {
        pdf.addPage()
        if (continuationLabel) drawContinuationHeader(pdf, continuationLabel)
      }
      const sliceHeightMm = sliceHeight / pxPerMm
      const topOffsetMm = (!isFirstPage && continuationLabel) ? headerH : 0
      pdf.addImage(imgData, 'JPEG', 0, topOffsetMm, pageWidthMm, sliceHeightMm)

      y = cut
      pageIndex += 1
    }

    blob = pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
  return blob
}
