import { useLang } from "../../lib/i18n/LanguageContext"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { C } from '../../lib/theme'

// Prawdziwy edytor tekstu w przeglądarce (jak Word Online) dla treści
// dokumentu wyceny — zastępuje dawny wizualny edytor "jak Canva"
// (QuoteLayoutEditor, przeciąganie sztywnych bloków) swobodną edycją tekstu:
// zespół może dopisać, przeformatować, wstawić obraz wprost w dokumencie.
// Startowa treść pochodzi z buildQuoteDocHtml (patrz docTemplate.js) — od tego
// momentu to TA treść (nie formularz) jest źródłem prawdy dla dokumentu,
// dopóki ktoś nie kliknie "Wygeneruj ponownie z formularza".
const btnStyle = (active) => ({
  padding: '5px 9px', borderRadius: 6, border: `1px solid ${active ? C.blue : C.border}`,
  background: active ? C.blight : '#fff', color: active ? C.blue : C.text2,
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', lineHeight: 1.2,
})

export default function QuoteWordEditor({ html, onChange, editable = true }) {
  const { t } = useLang()
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: html || '<p></p>',
    editable,
    onUpdate: ({ editor }) => onChange && onChange(editor.getHTML()),
  })

  if (!editor) return null

  const addImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {editable && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8, borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <button type="button" style={btnStyle(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>{t('B')}</button>
          <button type="button" style={{ ...btnStyle(editor.isActive('italic')), fontStyle: 'italic' }} onClick={() => editor.chain().focus().toggleItalic().run()}>{t('I')}</button>
          <button type="button" style={{ ...btnStyle(editor.isActive('underline')), textDecoration: 'underline' }} onClick={() => editor.chain().focus().toggleUnderline().run()}>{t('U')}</button>
          <button type="button" style={btnStyle(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>{t('H1')}</button>
          <button type="button" style={btnStyle(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>{t('H2')}</button>
          <button type="button" style={btnStyle(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>{t('• Lista')}</button>
          <button type="button" style={btnStyle(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>{t('1. Lista')}</button>
          <button type="button" style={btnStyle(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()}>{t('⇤')}</button>
          <button type="button" style={btnStyle(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()}>{t('↔')}</button>
          <button type="button" style={btnStyle(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()}>{t('⇥')}</button>
          <input type="color" title={t('Kolor tekstu')} onChange={e => editor.chain().focus().setColor(e.target.value).run()}
            style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: 0, cursor: 'pointer' }} />
          <button type="button" style={btnStyle(false)} onClick={addImage}>{t('🖼 Obraz')}</button>
          <button type="button" style={btnStyle(false)} onClick={() => editor.chain().focus().undo().run()}>{t('↶')}</button>
          <button type="button" style={btnStyle(false)} onClick={() => editor.chain().focus().redo().run()}>{t('↷')}</button>
        </div>
      )}
      <div style={{ padding: '22px 24px', maxHeight: 640, overflowY: 'auto' }}>
        <EditorContent editor={editor} className="quote-doc-editor" />
      </div>
      <style>{`
        .quote-doc-editor .ProseMirror { outline: none; font-family: inherit; color: ${C.text}; font-size: 12.5px; line-height: 1.55; }
        .quote-doc-editor .ProseMirror img { max-width: 100%; border-radius: 6px; }
        .quote-doc-editor .ProseMirror h1 { font-size: 20px; margin: 14px 0 8px; }
        .quote-doc-editor .ProseMirror h2 { font-size: 16px; margin: 12px 0 6px; }
        .quote-doc-editor .ProseMirror p { margin: 6px 0; }
      `}</style>
    </div>
  )
}
