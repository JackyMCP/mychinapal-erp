import { useLang } from "../../lib/i18n/LanguageContext"
import { useRef } from 'react'
import { C } from '../../lib/theme'

// Dokument wyceny edytowany BEZPOŚREDNIO w tym samym wyglądzie, jaki
// widzi klient (granat/logo/poświata/pozycje ze zdjęciami) — zamiast
// wcześniejszej próby z TipTap/ProseMirror. Ten sam wyrenderowany HTML jest
// po prostu oznaczony jako contentEditable, więc przeglądarka pozwala
// dowolnie zmieniać tekst WPROST w nim, bez przepuszczania przez żaden
// schemat edytora, który wcześniej gubił tabele/style i psuł układ.
// `version` wymusza pełny reset zawartości (nowy `key`) tylko przy
// wczytaniu wyceny albo kliknięciu "Wygeneruj ponownie z formularza" —
// między tymi momentami div NIE jest nadpisywany przy każdym wpisywanym
// znaku (inaczej kursor by "skakał"), tylko czyta się z niego na bieżąco.
const btn = { padding: '5px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', lineHeight: 1.2 }

export default function QuoteDocEditor({ html, version, onChange, editable = true }) {
  const { t } = useLang()
  const ref = useRef(null)

  const exec = (cmd, val) => {
    document.execCommand(cmd, false, val)
    ref.current?.focus()
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const addImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => exec('insertImage', String(reader.result))
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {editable && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8, borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}>{t('B')}</button>
          <button type="button" style={{ ...btn, fontStyle: 'italic' }} onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}>{t('I')}</button>
          <button type="button" style={{ ...btn, textDecoration: 'underline' }} onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}>{t('U')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', 'H1')}>{t('H1')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', 'H2')}>{t('H2')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', 'P')}>{t('P')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>{t('• Lista')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')}>{t('1. Lista')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyLeft')}>{t('⇤')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyCenter')}>{t('↔')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyRight')}>{t('⇥')}</button>
          <input type="color" title={t('Kolor tekstu')} onMouseDown={e => e.preventDefault()}
            onChange={e => exec('foreColor', e.target.value)}
            style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: 0, cursor: 'pointer' }} />
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={addImage}>{t('🖼 Obraz')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('undo')}>{t('↶')}</button>
          <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => exec('redo')}>{t('↷')}</button>
        </div>
      )}
      <div
        key={version}
        ref={ref}
        contentEditable={editable}
        suppressContentEditableWarning
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ padding: '22px 24px', maxHeight: 700, overflowY: 'auto', outline: 'none', fontSize: 12.5, lineHeight: 1.55, color: C.text }}
      />
    </div>
  )
}
