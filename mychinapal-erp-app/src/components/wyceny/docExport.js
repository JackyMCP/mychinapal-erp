import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// Renderuje podaną treść HTML (zmaterializowany dokument wyceny, edytowany
// bezpośrednio w QuoteDocEditor przez contentEditable) do PDF — zastępuje
// dawny generator pdf.js/pdfFromLayout.js, który rysował PDF ręcznie
// element-po-elemencie. Teraz PDF to po prostu "zdjęcie" aktualnej treści
// dokumentu (tego co widać w edytorze), pocięte na strony A4 — dzięki temu
// klient zawsze dostaje DOKŁADNIE to, co zespół ułożył w dokumencie, łącznie
// z ręcznymi poprawkami tekstu/formatowania.
export async function exportHtmlToPdfBlob(html) {
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
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidthMm = 210
    const pageHeightMm = 297
    const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width
    let heightLeft = imgHeightMm
    let position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, pageWidthMm, imgHeightMm)
    heightLeft -= pageHeightMm
    while (heightLeft > 0) {
      position = heightLeft - imgHeightMm
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, pageWidthMm, imgHeightMm)
      heightLeft -= pageHeightMm
    }
    blob = pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
  return blob
}
