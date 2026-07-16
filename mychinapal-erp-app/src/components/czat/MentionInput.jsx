import { useRef, useState } from 'react'
import { C } from '../../lib/theme'

// Pole tekstowe czatu z autouzupełnianiem @wzmianek — zastępuje zwykły
// <input> w Czat.jsx / TabCzat.jsx / ProjectChat.jsx. Zachowuje identyczny
// wygląd (przyjmuje `style` tak jak dotychczasowy <input>), dodaje tylko
// rozwijaną listę podpowiedzi osób, gdy użytkownik wpisze "@" i zacznie
// pisać imię/nazwisko.
export default function MentionInput({ value, onChange, onEnter, placeholder, style, profiles, autoFocus }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [atPos, setAtPos] = useState(-1)
  const inputRef = useRef(null)

  const matches = open
    ? (profiles || []).filter(p => p.full_name && p.full_name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : []

  const detectAt = (val, caret) => {
    const upto = val.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1) { setOpen(false); return }
    const afterAt = upto.slice(at + 1)
    if (/[\n@]/.test(afterAt) || afterAt.length > 30) { setOpen(false); return }
    setAtPos(at)
    setQuery(afterAt)
    setActiveIdx(0)
    setOpen(true)
  }

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    detectAt(val, e.target.selectionStart ?? val.length)
  }

  const pick = (p) => {
    if (atPos === -1) return
    const before = value.slice(0, atPos)
    const caret = inputRef.current?.selectionStart ?? value.length
    const after = value.slice(caret)
    const next = `${before}@${p.full_name} ${after}`
    onChange(next)
    setOpen(false)
    requestAnimationFrame(() => {
      const pos = before.length + p.full_name.length + 2
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e) => {
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, matches.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[activeIdx]); return }
      if (e.key === 'Escape') { setOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter?.() }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input ref={inputRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        placeholder={placeholder} autoFocus={autoFocus} style={{ width: '100%', boxSizing: 'border-box', ...style }} />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 10px 26px rgba(0,0,0,.14)', minWidth: 200, zIndex: 40, overflow: 'hidden' }}>
          {matches.map((p, i) => (
            <div key={p.id} onMouseDown={(e) => { e.preventDefault(); pick(p) }}
              style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: i === activeIdx ? C.blight : '#fff', color: i === activeIdx ? C.blue : C.text }}>
              @{p.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
