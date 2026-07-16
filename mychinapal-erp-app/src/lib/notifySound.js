// Odróżnialny dźwięk dla @wzmianek na czacie — inny niż dzwonek
// wejścia/wyjścia z kanału głosowego (patrz VoiceChannel.jsx, dwa tony) i
// inny niż domyślny brak dźwięku przy zwykłej nowej wiadomości. Syntetyzowany
// na żywo Web Audio API, więc nie potrzebuje żadnego pliku audio w repo.
let ctx = null
function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx || ctx.state === 'closed') ctx = new AC()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(c, freq, start, duration, peak = 0.18) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, c.currentTime + start)
  gain.gain.linearRampToValueAtTime(peak, c.currentTime + start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + duration + 0.02)
}

// Trzy krótkie, jasne, wznoszące się tony — wyraźnie inny charakter niż
// dwutonowy dzwonek kanału głosowego, żeby dało się je rozpoznać "w uchu"
// bez patrzenia na ekran.
export function playMentionSound() {
  const c = getCtx()
  if (!c) return
  tone(c, 880, 0, 0.11, 0.2)
  tone(c, 1175, 0.09, 0.11, 0.2)
  tone(c, 1568, 0.18, 0.17, 0.22)
}
