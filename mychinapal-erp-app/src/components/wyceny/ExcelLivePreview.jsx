import { toNum } from './calc'

// Podgląd wyceny wyglądający jak dokładnie ten plik Excel, który dostanie
// klient (ta sama treść i branding co excelExport.js) — ale w odróżnieniu od
// dawnego "żywego dokumentu" (docHtml/QuoteDocEditor, usunięte w zadaniu
// #220) NIE jest osobnym, materializowanym HTML-em, który trzeba było
// ręcznie "odświeżać"/synchronizować z formularzem. To jest CZYSTY WIDOK nad
// tymi samymi danymi (items/quote), a edycja pisze WPROST do tego samego
// stanu, który czyta formularz wyżej i który później czyta excelExport.js
// przy wysyłce — więc nie ma szans, żeby podgląd "rozjechał się" z tym, co
// faktycznie zostanie wysłane.
//
// Edytowalne bezpośrednio tutaj: nazwa/specyfikacja pozycji, zdjęcie (drag&
// drop — współdzieli mechanizm z sekcją "Pozycje towaru" wyżej, więc można
// przeciągnąć zdjęcie MIĘDZY dwoma miejscami w formularzu), ręczna cena
// netto/szt. (to samo pole "Cena PLN/szt." co w formularzu), dane NABYWCY
// (nadpisania TYLKO tej wyceny — nie zmieniają karty klienta w Klienci/CRM)
// i tekst "Warunki". Ilość/jednostka zostają tylko w formularzu wyżej.

const NAVY = '#0A1628'
const GOLD = '#B48C28'
const MUTED = '#64748B'
const BORDER = '#E5E7EB'
const BG_SOFT = '#F7F8FA'

const cellInput = {
  border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 7px', fontSize: 11.5,
  width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
}
const buyerInput = { ...cellInput, padding: '4px 6px', fontSize: 10.5, marginBottom: 3 }

export default function ExcelLivePreview({
  quote, client, contact, company, rows, totals, photoUrl, logoDataUrl,
  onChangeItem, onChangeNotes, onChangeQuote, draggedPhoto, movePhoto,
}) {
  const sellerLines = [
    company?.company_name || 'MyChinaPal Sp. z o.o.',
    company?.company_address || '',
    company?.company_nip ? `NIP: ${company.company_nip}` : '',
    company?.company_krs ? `KRS: ${company.company_krs}` : '',
    company?.company_regon ? `REGON: ${company.company_regon}` : '',
  ].filter(Boolean)

  // Wartość pola nabywcy = nadpisanie tej wyceny, jeśli ustawione, inaczej
  // dane z karty klienta/kontaktu (pokazane jako placeholder, gdy nadpisania
  // jeszcze nie ma — więc widać skąd bierze się domyślna treść).
  const buyerFallback = {
    name: client?.full_name || client?.name || '',
    address: client?.address || '',
    nip: client?.nip || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
  }
  const hasAnyBuyerOverride = ['name', 'address', 'nip', 'email', 'phone']
    .some(k => quote?.[`buyer_${k}_override`])
  const setBuyerField = (key, value) => onChangeQuote({ [`buyer_${key}_override`]: value || null })
  const resetBuyerOverrides = () => onChangeQuote({
    buyer_name_override: null, buyer_address_override: null, buyer_nip_override: null,
    buyer_email_override: null, buyer_phone_override: null,
  })

  const handlePhotoDrop = (e, toKey, toPath) => {
    e.preventDefault()
    const dragged = draggedPhoto?.current
    if (dragged && movePhoto) movePhoto(dragged.key, dragged.path, toKey, toPath)
    if (draggedPhoto) draggedPhoto.current = null
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', background: '#fff', fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}>
      {/* Nagłówek */}
      <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, borderBottom: `2px solid ${BORDER}` }}>
        <div>
          {logoDataUrl ? <img src={logoDataUrl} alt="logo" style={{ height: 34, objectFit: 'contain' }} /> : (
            <div style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>{company?.company_name || 'MyChinaPal Sp. z o.o.'}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: '.04em' }}>WYCENA</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{quote?.quote_number}</div>
          <div style={{ fontSize: 10, color: MUTED }}>
            {quote?.created_at ? `Data: ${new Date(quote.created_at).toLocaleDateString('pl-PL')}` : ''}
            {quote?.valid_until ? `   ·   Ważna do: ${new Date(quote.valid_until).toLocaleDateString('pl-PL')}` : ''}
          </div>
        </div>
      </div>

      {/* Sprzedawca / Nabywca */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: NAVY, marginBottom: 4, letterSpacing: '.04em' }}>SPRZEDAWCA</div>
          {sellerLines.map((l, i) => <div key={i} style={{ fontSize: 10.5, color: i === 0 ? '#141414' : MUTED, fontWeight: i === 0 ? 700 : 400, lineHeight: 1.5 }}>{l}</div>)}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: NAVY, letterSpacing: '.04em' }}>NABYWCA</div>
            {hasAnyBuyerOverride && (
              <button type="button" onClick={resetBuyerOverrides} title="Przywróć dane z karty klienta"
                style={{ fontSize: 8.5, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                ↺ dane klienta
              </button>
            )}
          </div>
          <input value={quote?.buyer_name_override ?? ''} placeholder={buyerFallback.name || 'Nazwa nabywcy'}
            onChange={e => setBuyerField('name', e.target.value)} style={{ ...buyerInput, fontWeight: 700 }} />
          <input value={quote?.buyer_address_override ?? ''} placeholder={buyerFallback.address || 'Adres'}
            onChange={e => setBuyerField('address', e.target.value)} style={buyerInput} />
          <input value={quote?.buyer_nip_override ?? ''} placeholder={buyerFallback.nip ? `NIP: ${buyerFallback.nip}` : 'NIP'}
            onChange={e => setBuyerField('nip', e.target.value)} style={buyerInput} />
          <input value={quote?.buyer_email_override ?? ''} placeholder={buyerFallback.email || 'E-mail'}
            onChange={e => setBuyerField('email', e.target.value)} style={buyerInput} />
          <input value={quote?.buyer_phone_override ?? ''} placeholder={buyerFallback.phone || 'Telefon'}
            onChange={e => setBuyerField('phone', e.target.value)} style={{ ...buyerInput, marginBottom: 0 }} />
        </div>
      </div>

      {/* Tabela pozycji */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: NAVY, color: '#fff' }}>
              {['Lp.', 'Zdjęcie', 'Produkt', 'Ilość', 'Cena netto / szt. (PLN)', 'Wartość netto (PLN)'].map((h, i) => (
                <th key={i} style={{ padding: '8px 10px', textAlign: i >= 3 ? (i === 4 || i === 5 ? 'right' : 'center') : 'left', fontWeight: 700, fontSize: 9.5, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const qtyNum = toNum(row.qty)
              const hasManualPln = row.unit_price_pln !== null && row.unit_price_pln !== undefined && row.unit_price_pln !== ''
              const autoUnitPln = qtyNum > 0 ? row.finalPrice / qtyNum : row.finalPrice
              const cover = (row.photo_paths || [])[0]
              return (
                <tr key={row._key} style={{ background: idx % 2 === 1 ? BG_SOFT : '#fff', borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: MUTED, verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handlePhotoDrop(e, row._key, cover || null)}>
                    {cover ? (
                      <img src={photoUrl(cover)} alt="" draggable
                        onDragStart={() => { if (draggedPhoto) draggedPhoto.current = { key: row._key, path: cover } }}
                        onDragEnd={() => { if (draggedPhoto) draggedPhoto.current = null }}
                        title="Przeciągnij, żeby przenieść do innej pozycji"
                        style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6, border: `1px solid ${BORDER}`, display: 'block', cursor: 'grab' }} />
                    ) : (
                      <div title="Przeciągnij tu zdjęcie z innej pozycji"
                        style={{ width: 46, height: 46, borderRadius: 6, border: `1px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: MUTED }}>—</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', verticalAlign: 'top', minWidth: 220 }}>
                    <input value={row.name || ''} onChange={e => onChangeItem(row._key, { name: e.target.value })}
                      placeholder="Nazwa produktu" style={{ ...cellInput, fontWeight: 700, marginBottom: 4 }} />
                    <textarea rows={2} value={row.specification || ''} onChange={e => onChangeItem(row._key, { specification: e.target.value })}
                      placeholder="Specyfikacja" style={{ ...cellInput, resize: 'vertical', color: MUTED, fontSize: 10.5 }} />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{qtyNum} {row.unit || ''}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top', width: 140 }}>
                    <input type="text" inputMode="decimal" value={row.unit_price_pln ?? ''} placeholder={autoUnitPln.toFixed(2)}
                      onChange={e => onChangeItem(row._key, { unit_price_pln: e.target.value })}
                      style={{ ...cellInput, textAlign: 'right' }} />
                    {hasManualPln && (
                      <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2, textAlign: 'right' }}>auto: {autoUnitPln.toFixed(2)}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top', fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>
                    {(row.finalPrice || 0).toFixed(2)} PLN
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Podsumowanie */}
      <div style={{ padding: '14px 18px', borderTop: `2px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {totals.totalCbm > 0 && (
          <div style={{ fontSize: 10.5, color: MUTED }}>Całkowita objętość zamówienia: <strong>{totals.totalCbm.toFixed(2)} m³</strong></div>
        )}
        <div style={{ fontSize: 11, color: '#141414' }}>Netto: <strong>{totals.finalPrice.toFixed(2)} PLN</strong></div>
        <div style={{ fontSize: 11, color: '#141414' }}>VAT (23%): <strong>{totals.vatAmount.toFixed(2)} PLN</strong></div>
        <div style={{ padding: '6px 14px', background: NAVY, color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 800 }}>
          RAZEM BRUTTO: {totals.finalPriceGross.toFixed(2)} PLN
        </div>
      </div>

      {/* Warunki */}
      <div style={{ padding: '14px 18px', borderTop: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: NAVY, marginBottom: 6, letterSpacing: '.04em' }}>WARUNKI</div>
        <textarea rows={4} value={quote?.notes || ''} onChange={e => onChangeNotes(e.target.value)}
          placeholder="np. Wycena ważna jest 15 dni. Wycena zawiera... Wycena nie zawiera... Czas produkcji: ok. ... dni roboczych."
          style={{ ...cellInput, resize: 'vertical', fontSize: 10.5, lineHeight: 1.5 }} />
      </div>

      {/* Stopka */}
      {company?.company_bank_account && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${BORDER}`, fontSize: 9.5, color: MUTED }}>
          Nr konta: {company.company_bank_account}
        </div>
      )}
    </div>
  )
}
