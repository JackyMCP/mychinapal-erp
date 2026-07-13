import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function VoiceChannel({ roomId, currentUserId, currentUserName, accentColor, chatChannelId }) {
  const {
    t
  } = useLang();

  const [participants, setParticipants] = useState({}) // userId -> { name }
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [speakingIds, setSpeakingIds] = useState(new Set())
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  // ── tłumaczenie głosowe AI (PL <-> ZH) ──
  const [myLang, setMyLang] = useState('pl')       // 'pl' | 'zh' — jakim językiem mówię
  const [aiTranslate, setAiTranslate] = useState(false) // czy inni mają usłyszeć mnie przetłumaczonego
  const [translateError, setTranslateError] = useState('')
  const [translateActive, setTranslateActive] = useState(false)

  // ── napisy na żywo (oryginał + tłumaczenie, rosnące na bieżąco jako wiadomość w czacie) ──
  const [liveCaptions, setLiveCaptions] = useState(false)
  const [captionsActive, setCaptionsActive] = useState(false)
  const [captionsError, setCaptionsError] = useState('')

  const channelRef = useRef(null)
  const localStreamRef = useRef(null)     // surowy strumień z mikrofonu
  const outgoingStreamRef = useRef(null)  // strumień faktycznie wysyłany do innych (surowy albo przetłumaczony)
  const peersRef = useRef({})       // userId -> RTCPeerConnection
  const audioElsRef = useRef({})    // userId -> HTMLAudioElement
  const analysersRef = useRef({})   // userId -> { analyser, data }
  const rafRef = useRef(null)
  const joinedRef = useRef(false)

  // -- PL -> ZH: bezpośrednie połączenie WebRTC z OpenAI Realtime Translation --
  const translatorPcRef = useRef(null)

  // -- ZH -> PL: nasłuch mowy (przeglądarka) -> tłumaczenie tekstu -> synteza mowy --
  const recognitionRef = useRef(null)
  const recognitionActiveRef = useRef(false)
  const audioCtxRef = useRef(null)
  const destNodeRef = useRef(null)
  // chunkowanie "na żywo" (żeby nie czekać na koniec CAŁEJ wypowiedzi):
  // dla każdego rozpoznawanego fragmentu (results[i]) pamiętamy ile znaków
  // już wysłaliśmy do tłumaczenia, i wysyłamy nowy kawałek jak tylko wykryjemy
  // koniec zdania (。！？.!?) albo krótką pauzę w mówieniu (~900ms bez zmiany tekstu)
  const chunkSentUpToRef = useRef({})   // { [resultIndex]: liczba już wysłanych znaków }
  const chunkTimersRef = useRef({})     // { [resultIndex]: setTimeout id }
  const chunkLastTextRef = useRef({})   // { [resultIndex]: ostatni widziany tekst }
  const playQueueRef = useRef(Promise.resolve()) // kolejka odtwarzania/zapisów — żeby fragmenty szły w kolejności wypowiadania

  // -- napisy na żywo: bieżąca wiadomość-"bąbelek" na czacie (jedna na wypowiedź) --
  const captionRowIdRef = useRef(null)   // id wiersza chat_messages aktualnie rosnącej wypowiedzi
  const captionTransRef = useRef('')     // narastające tłumaczenie (aktualizowane fragmentami, wolniej)
  // "content" (oryginał) aktualizujemy NATYCHMIAST, słowo po słowie — nie czekamy na
  // interpunkcję/pauzę jak w przypadku tłumaczenia. Throttlujemy tylko zapisy do bazy
  // (maks. ~1 na PREVIEW_THROTTLE_MS), żeby nie wysyłać zapytania przy każdej literze.
  const previewPendingTextRef = useRef('')
  const previewLastSentAtRef = useRef(0)
  const previewTimerRef = useRef(null)
  // -- napisy na żywo: dedykowany nasłuch mowy, używany gdy NIE ma już innego nasłuchu
  // (czyli dla PL, albo dla ZH gdy tłumaczenie głosu jest wyłączone) --
  const captionRecognitionRef = useRef(null)
  const captionRecognitionActiveRef = useRef(false)
  const captionChunkSentUpToRef = useRef({})
  const captionChunkTimersRef = useRef({})
  const captionChunkLastTextRef = useRef({})

  // ── presence-only subscription: żeby widzieć kto jest na kanale, nawet zanim dołączymy ──
  useEffect(() => {
    const channel = supabase.channel(roomId, { config: { presence: { key: currentUserId } } })
    channelRef.current = channel

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const map = {}
      Object.entries(state).forEach(([uid, metas]) => { map[uid] = { name: metas[0]?.name || '?' } })
      setParticipants(map)
    })

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (joinedRef.current && key !== currentUserId) {
        // ktoś nowy dołączył podczas gdy my już jesteśmy na kanale — inicjujemy połączenie
        // wg zasady: strona z "mniejszym" id inicjuje ofertę, żeby uniknąć podwójnej oferty
        if (currentUserId < key) createOfferTo(key)
      }
    })

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      closePeer(key)
    })

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.to !== currentUserId) return
      handleSignal(payload)
    })

    channel.subscribe()

    return () => {
      leaveCall()
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUserId])

  function send(type, to, data) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type, from: currentUserId, to, ...data } })
  }

  function attachAnalyser(userId, stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analysersRef.current[userId] = { analyser, data: new Uint8Array(analyser.frequencyBinCount) }
    } catch (e) { /* ignore */ }
  }

  function startSpeakingLoop() {
    const tick = () => {
      const speaking = new Set()
      Object.entries(analysersRef.current).forEach(([uid, { analyser, data }]) => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        if (avg > 12) speaking.add(uid)
      })
      setSpeakingIds(speaking)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    // do innych uczestników wysyłamy strumień "wyjściowy" — surowy mikrofon,
    // albo (jeśli aktywne jest tłumaczenie AI) już przetłumaczony/zsyntezowany głos
    const outStream = outgoingStreamRef.current || localStreamRef.current
    outStream?.getTracks().forEach(track => pc.addTrack(track, outStream))

    pc.onicecandidate = (e) => {
      if (e.candidate) send('ice', peerId, { candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      let audioEl = audioElsRef.current[peerId]
      if (!audioEl) {
        audioEl = new Audio()
        audioEl.autoplay = true
        audioElsRef.current[peerId] = audioEl
      }
      audioEl.srcObject = stream
      attachAnalyser(peerId, stream)
    }
    peersRef.current[peerId] = pc
    return pc
  }

  async function createOfferTo(peerId) {
    const pc = createPeerConnection(peerId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    send('offer', peerId, { sdp: offer })
  }

  async function handleSignal(payload) {
    const { type, from, sdp, candidate } = payload
    if (type === 'offer') {
      const pc = peersRef.current[from] || createPeerConnection(from)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send('answer', from, { sdp: answer })
    } else if (type === 'answer') {
      const pc = peersRef.current[from]
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    } else if (type === 'ice') {
      const pc = peersRef.current[from]
      if (pc && candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (e) { /* ignore */ } }
    }
  }

  function closePeer(peerId) {
    peersRef.current[peerId]?.close()
    delete peersRef.current[peerId]
    delete audioElsRef.current[peerId]
    delete analysersRef.current[peerId]
  }

  // ── PL -> ZH: mintujemy krótkotrwały token OpenAI i łączymy się z nim wprost przez WebRTC ──
  // (mikrofon idzie do OpenAI, a to co OpenAI odeśle "ontrack" to już przetłumaczony na chiński głos)
  async function setupOpenAITranslator(targetLang) {
    const { data, error: fnErr } = await supabase.functions.invoke('openai-realtime-token-ts', { body: { target_language: targetLang, user_id: currentUserId } })
    if (fnErr) throw new Error('token: ' + fnErr.message)
    if (!data?.ok) throw new Error(data?.error || 'nieznany błąd tokenu OpenAI')
    const ephemeralKey = data.client_secret

    const pc = new RTCPeerConnection()
    translatorPcRef.current = pc

    const remoteStream = new MediaStream()
    pc.ontrack = (e) => { e.streams[0]?.getTracks().forEach(tr => remoteStream.addTrack(tr)) }

    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))
    pc.createDataChannel('oai-events') // wymagane przez OpenAI do negocjacji sesji tłumaczeniowej

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // UWAGA: sesje tłumaczeniowe (client_secret z /realtime/translations/client_secrets) łączy się
    // z DEDYKOWANYM adresem /realtime/translations/calls — NIE z ogólnym /realtime/calls (ten drugi
    // jest dla zwykłych sesji asystenta głosowego typu gpt-realtime-2 i odrzuci token tłumaczeniowy
    // kodem 400, tak jak się stało przy pierwszym teście).
    const sdpRes = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    })
    if (!sdpRes.ok) {
      const errBody = await sdpRes.text().catch(() => '')
      throw new Error('OpenAI odrzuciło połączenie (kod ' + sdpRes.status + ') ' + errBody.slice(0, 200))
    }
    const answerSdp = await sdpRes.text()
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    // czekamy aż popłynie pierwszy strumień przetłumaczonego audio
    const start = Date.now()
    while (remoteStream.getTracks().length === 0) {
      if (Date.now() - start > 6000) throw new Error('OpenAI nie odesłało audio w oczekiwanym czasie')
      await new Promise(r => setTimeout(r, 150))
    }
    return remoteStream
  }

  // ── ZH -> PL: polski nie jest wspierany jako język wyjściowy modelu tłumaczącego mowę-na-mowę,
  // więc idziemy ścieżką: rozpoznanie mowy w przeglądarce -> tłumaczenie tekstu (Claude) -> synteza mowy (OpenAI TTS) ──
  //
  // Żeby rozmowa mogła płynąć na bieżąco (a nie dopiero po całej wypowiedzi), NIE czekamy na
  // "isFinal" rozpoznawania mowy jako jedyny moment wysłania tekstu do tłumaczenia. Zamiast tego
  // wysyłamy nowo rozpoznany kawałek tekstu do tłumaczenia od razu, gdy: (a) wykryjemy w nim znak
  // końca zdania (。！？.!?), albo (b) tekst się nie zmienił od ~900ms (czyli mówiący zrobił pauzę).
  // Każdy taki kawałek trafia do kolejki odtwarzania (playQueueRef), żeby fragmenty zawsze zagrały
  // u słuchacza w tej samej kolejności, w jakiej zostały wypowiedziane — nawet jeśli tłumaczenie
  // jednego kawałka akurat trwa dłużej niż kolejnego.
  const SENTENCE_END_RE = /[。！？.!?]/
  const CHUNK_SILENCE_MS = 900
  const MIN_CHUNK_CHARS = 2

  // tłumaczy jeden kawałek tekstu (Claude, przez naszą funkcję translate-text-ts) — zwraca
  // null jeśli się nie uda (wtedy pokazujemy przynajmniej oryginał, żeby napisy nie "zamarły")
  async function translateChunk(text, to) {
    try {
      const { data: trData } = await supabase.functions.invoke('translate-text-ts', { body: { text, to } })
      if (trData?.ok && trData.translated) return trData.translated
    } catch (e) { /* ignore — spróbujemy dalej z samym oryginałem */ }
    return null
  }

  const PREVIEW_THROTTLE_MS = 450

  // aktualizuje TYLKO oryginalny tekst ("content") — natychmiast, słowo po słowie, w miarę
  // jak rozpoznawanie mowy rozpoznaje kolejne słowa. Zapisy do bazy są throttlowane (maks.
  // ~1 na PREVIEW_THROTTLE_MS) — bez tego wysyłalibyśmy zapytanie kilka razy na sekundę.
  function scheduleLivePreview(fullTextSoFar, srcLangCode, targetLangCode) {
    if (!chatChannelId) return
    previewPendingTextRef.current = fullTextSoFar
    const now = Date.now()
    const elapsed = now - previewLastSentAtRef.current
    if (elapsed >= PREVIEW_THROTTLE_MS) {
      sendPreviewNow(srcLangCode, targetLangCode)
    } else if (!previewTimerRef.current) {
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null
        sendPreviewNow(srcLangCode, targetLangCode)
      }, PREVIEW_THROTTLE_MS - elapsed)
    }
  }

  async function sendPreviewNow(srcLangCode, targetLangCode) {
    previewLastSentAtRef.current = Date.now()
    const text = previewPendingTextRef.current
    if (!chatChannelId || !text || !text.trim()) return
    try {
      if (!captionRowIdRef.current) {
        const { data: inserted, error } = await supabase.from('chat_messages').insert({
          channel_id: chatChannelId, sender_id: currentUserId,
          content: text, translated_content: captionTransRef.current || null,
          original_language: srcLangCode, translated_language: targetLangCode,
          is_live_caption: true,
        }).select('id').single()
        if (!error && inserted) captionRowIdRef.current = inserted.id
      } else {
        await supabase.from('chat_messages').update({ content: text }).eq('id', captionRowIdRef.current)
      }
    } catch (e) { /* pojedyncza aktualizacja podglądu się nie udała — kolejne i tak nadejdą */ }
  }

  // dopisuje nowo przetłumaczony kawałek do TŁUMACZENIA bieżącej wiadomości-napisów (druga
  // linijka, pod oryginałem) — to aktualizuje się rzadziej niż oryginał, bo tłumaczenie
  // wymaga kontekstu (nie da się dobrze tłumaczyć słowo po słowie)
  async function upsertCaptionRow(piece, translatedPiece, srcLangCode, targetLangCode) {
    if (!chatChannelId || !piece.trim()) return
    captionTransRef.current = (captionTransRef.current ? captionTransRef.current + ' ' : '') + (translatedPiece || piece).trim()
    try {
      if (!captionRowIdRef.current) {
        const { data: inserted, error } = await supabase.from('chat_messages').insert({
          channel_id: chatChannelId, sender_id: currentUserId,
          content: previewPendingTextRef.current || piece, translated_content: captionTransRef.current,
          original_language: srcLangCode, translated_language: targetLangCode,
          is_live_caption: true,
        }).select('id').single()
        if (!error && inserted) captionRowIdRef.current = inserted.id
      } else {
        await supabase.from('chat_messages').update({ translated_content: captionTransRef.current }).eq('id', captionRowIdRef.current)
      }
    } catch (e) { /* nie udało się zapisać tłumaczenia napisów — nasłuch i rozmowa jedą dalej */ }
  }

  // koniec wypowiedzi (dłuższa pauza w mówieniu) — następny kawałek zacznie NOWĄ wiadomość
  function resetCaptionRow() {
    captionRowIdRef.current = null
    captionTransRef.current = ''
    previewPendingTextRef.current = ''
    previewLastSentAtRef.current = 0
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null }
  }

  // dedykowany nasłuch mowy TYLKO do napisów (używany dla PL, oraz dla ZH gdy tłumaczenie
  // głosu jest wyłączone — bo wtedy nie ma już innego nasłuchu, z którego moglibyśmy skorzystać)
  function startCaptionOnlyRecognition(recLang, srcLangCode, targetLangCode) {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) throw new Error('ta przeglądarka nie wspiera rozpoznawania mowy (działa w Chrome/Edge)')

    captionChunkSentUpToRef.current = {}
    captionChunkTimersRef.current = {}
    captionChunkLastTextRef.current = {}

    function pushChunk(piece) {
      playQueueRef.current = playQueueRef.current.then(async () => {
        const translated = await translateChunk(piece, targetLangCode)
        await upsertCaptionRow(piece, translated, srcLangCode, targetLangCode)
      })
    }
    function flushC(i, text, isFinal) {
      const already = captionChunkSentUpToRef.current[i] || 0
      const piece = text.slice(already).trim()
      if (isFinal) {
        captionChunkSentUpToRef.current[i] = text.length
        if (captionChunkTimersRef.current[i]) { clearTimeout(captionChunkTimersRef.current[i]); delete captionChunkTimersRef.current[i] }
        delete captionChunkLastTextRef.current[i]
      } else {
        captionChunkSentUpToRef.current[i] = text.length
      }
      if (piece.length >= MIN_CHUNK_CHARS) pushChunk(piece)
      if (isFinal) resetCaptionRow()
    }
    function scheduleC(i, text) {
      captionChunkLastTextRef.current[i] = text
      if (captionChunkTimersRef.current[i]) clearTimeout(captionChunkTimersRef.current[i])
      captionChunkTimersRef.current[i] = setTimeout(() => {
        if (captionChunkLastTextRef.current[i] === text) flushC(i, text, false)
      }, CHUNK_SILENCE_MS)
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = recLang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const text = res[0]?.transcript || ''
        // oryginał aktualizuje się NATYCHMIAST, słowo po słowie — niezależnie od tego,
        // kiedy tłumaczenie zdąży dogonić (poniżej)
        scheduleLivePreview(text, srcLangCode, targetLangCode)
        if (res.isFinal) { flushC(i, text, true); continue }
        const already = captionChunkSentUpToRef.current[i] || 0
        const newPart = text.slice(already)
        const m = newPart.match(SENTENCE_END_RE)
        if (m) {
          const cut = already + m.index + 1
          flushC(i, text.slice(0, cut), false)
          captionChunkSentUpToRef.current[i] = cut
        } else {
          scheduleC(i, text)
        }
      }
    }
    recognition.onerror = () => { /* np. chwila ciszy — ignorujemy, onend zadba o restart */ }
    recognition.onend = () => {
      if (captionRecognitionActiveRef.current) { try { recognition.start() } catch (e) { /* ignore */ } }
    }

    captionRecognitionActiveRef.current = true
    recognition.start()
    captionRecognitionRef.current = recognition
  }

  function setupSpeechToTextPipeline() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) throw new Error('ta przeglądarka nie wspiera rozpoznawania mowy (działa w Chrome/Edge)')

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const dest = audioCtx.createMediaStreamDestination()
    audioCtxRef.current = audioCtx
    destNodeRef.current = dest

    chunkSentUpToRef.current = {}
    chunkTimersRef.current = {}
    chunkLastTextRef.current = {}
    playQueueRef.current = Promise.resolve()

    async function speakChunk(text) {
      // dołączamy do kolejki — kolejny fragment zaczyna się tłumaczyć/syntezować dopiero
      // gdy poprzedni jest już zlecony do odtworzenia, więc kolejność wypowiedzi jest zachowana
      playQueueRef.current = playQueueRef.current.then(async () => {
        try {
          const translated = await translateChunk(text, 'pl')
          // napisy na żywo (jeśli włączone) korzystają z tego samego nasłuchu i tego samego
          // tłumaczenia co dubbing głosowy — nie odpalamy przez to drugiego nasłuchu mikrofonu
          if (liveCaptions) await upsertCaptionRow(text, translated, 'zh', 'pl')
          if (!translated) return

          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData?.session?.access_token || supabaseAnonKey

          const ttsRes = await fetch(`${supabaseUrl}/functions/v1/tts-speak-ts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text: translated }),
          })
          if (!ttsRes.ok || !audioCtxRef.current) return
          const arrBuf = await ttsRes.arrayBuffer()
          const audioBuf = await audioCtxRef.current.decodeAudioData(arrBuf)
          const src = audioCtxRef.current.createBufferSource()
          src.buffer = audioBuf
          src.connect(destNodeRef.current)
          src.start()
          // czekamy aż fragment się odegra, żeby NASTĘPNY fragment nie zaczął grać w tym samym momencie
          await new Promise(resolve => { src.onended = resolve })
        } catch (e) { /* pojedynczy fragment się nie udał — kolejka i nasłuch jedzie dalej */ }
      })
    }

    function flush(i, text, isFinal) {
      const already = chunkSentUpToRef.current[i] || 0
      const piece = text.slice(already).trim()
      if (isFinal) {
        chunkSentUpToRef.current[i] = text.length
        if (chunkTimersRef.current[i]) { clearTimeout(chunkTimersRef.current[i]); delete chunkTimersRef.current[i] }
        delete chunkLastTextRef.current[i]
      } else {
        chunkSentUpToRef.current[i] = text.length
      }
      if (piece.length >= MIN_CHUNK_CHARS) speakChunk(piece)
      if (isFinal && liveCaptions) resetCaptionRow()
    }

    function scheduleInterimCheck(i, text) {
      chunkLastTextRef.current[i] = text
      if (chunkTimersRef.current[i]) clearTimeout(chunkTimersRef.current[i])
      chunkTimersRef.current[i] = setTimeout(() => {
        // jeśli tekst się nie zmienił od CHUNK_SILENCE_MS — mówiący zrobił pauzę, wysyłamy co mamy
        if (chunkLastTextRef.current[i] === text) flush(i, text, false)
      }, CHUNK_SILENCE_MS)
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const text = res[0]?.transcript || ''
        // napisy: oryginał aktualizuje się NATYCHMIAST, słowo po słowie (jeśli włączone) —
        // niezależnie od tempa tłumaczenia/dubbingu głosowego poniżej
        if (liveCaptions) scheduleLivePreview(text, 'zh', 'pl')
        if (res.isFinal) {
          flush(i, text, true)
          continue
        }
        const already = chunkSentUpToRef.current[i] || 0
        const newPart = text.slice(already)
        // koniec zdania widoczny w nowo rozpoznanej części — wysyłamy natychmiast, bez czekania na pauzę
        const m = newPart.match(SENTENCE_END_RE)
        if (m) {
          const cut = already + m.index + 1
          flush(i, text.slice(0, cut), false)
          chunkSentUpToRef.current[i] = cut
        } else {
          scheduleInterimCheck(i, text)
        }
      }
    }
    recognition.onerror = () => { /* np. chwila ciszy — ignorujemy, onend zadba o restart */ }
    recognition.onend = () => {
      if (recognitionActiveRef.current) { try { recognition.start() } catch (e) { /* ignore */ } }
    }

    recognitionActiveRef.current = true
    recognition.start()
    recognitionRef.current = recognition

    return dest.stream
  }

  async function joinCall() {
    setError('')
    setTranslateError('')
    setTranslateActive(false)
    setCaptionsError('')
    setCaptionsActive(false)
    setConnecting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      let outgoing = stream
      let zhDubActive = false
      if (aiTranslate) {
        try {
          if (myLang === 'pl') {
            outgoing = await setupOpenAITranslator('zh')
          } else {
            outgoing = setupSpeechToTextPipeline()
            zhDubActive = true
          }
          setTranslateActive(true)
        } catch (e) {
          setTranslateError(t('Tłumaczenie AI niedostępne (') + e.message + t(') — rozmowa idzie dalej Twoim naturalnym głosem.'))
          outgoing = stream
        }
      }
      outgoingStreamRef.current = outgoing

      if (liveCaptions) {
        resetCaptionRow()
        try {
          // jeśli mowa ZH jest już nasłuchiwana pod dubbing głosowy — napisy dopisują się
          // do TEGO SAMEGO nasłuchu (patrz speakChunk). W innym wypadku (PL, albo ZH bez
          // dubbingu głosu) potrzebny jest osobny, dedykowany nasłuch tylko do napisów.
          if (!zhDubActive) {
            const recLang = myLang === 'pl' ? 'pl-PL' : 'zh-CN'
            const srcCode = myLang === 'pl' ? 'pl' : 'zh'
            const dstCode = myLang === 'pl' ? 'zh' : 'pl'
            startCaptionOnlyRecognition(recLang, srcCode, dstCode)
          }
          setCaptionsActive(true)
        } catch (e) {
          setCaptionsError(t('Napisy na żywo niedostępne (') + e.message + t(')'))
        }
      }

      attachAnalyser(currentUserId, stream)
      startSpeakingLoop()
      await channelRef.current.track({ name: currentUserName })
      joinedRef.current = true
      setJoined(true)
      // zainicjuj połączenia z osobami już obecnymi na kanale
      const existing = Object.keys(participants).filter(uid => uid !== currentUserId)
      existing.forEach(uid => { if (currentUserId < uid) createOfferTo(uid) })
    } catch (e) {
      setError('Nie udało się uzyskać dostępu do mikrofonu: ' + e.message)
    }
    setConnecting(false)
  }

  function leaveCall() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    Object.keys(peersRef.current).forEach(closePeer)

    translatorPcRef.current?.close()
    translatorPcRef.current = null

    recognitionActiveRef.current = false
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch (e) { /* ignore */ } ; recognitionRef.current = null }
    if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch (e) { /* ignore */ } ; audioCtxRef.current = null }
    destNodeRef.current = null
    Object.values(chunkTimersRef.current).forEach(id => clearTimeout(id))
    chunkTimersRef.current = {}
    chunkSentUpToRef.current = {}
    chunkLastTextRef.current = {}
    playQueueRef.current = Promise.resolve()

    captionRecognitionActiveRef.current = false
    if (captionRecognitionRef.current) { try { captionRecognitionRef.current.stop() } catch (e) { /* ignore */ } ; captionRecognitionRef.current = null }
    Object.values(captionChunkTimersRef.current).forEach(id => clearTimeout(id))
    captionChunkTimersRef.current = {}
    captionChunkSentUpToRef.current = {}
    captionChunkLastTextRef.current = {}
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null }
    resetCaptionRow()
    setCaptionsActive(false)
    setCaptionsError('')

    outgoingStreamRef.current?.getTracks().forEach(tr => { try { tr.stop() } catch (e) { /* ignore */ } })
    outgoingStreamRef.current = null

    localStreamRef.current?.getTracks().forEach(row => row.stop())
    localStreamRef.current = null

    if (joinedRef.current) channelRef.current?.untrack()
    joinedRef.current = false
    setJoined(false)
    setMuted(false)
    setSpeakingIds(new Set())
    setTranslateActive(false)
    setTranslateError('')
  }

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = muted; setMuted(m => !m) }
    // przy tłumaczeniu ZH->PL: kiedy wyciszamy mikrofon, wstrzymujemy też nasłuch mowy (i odwrotnie)
    if (myLang === 'zh' && recognitionRef.current) {
      if (muted) { recognitionActiveRef.current = true; try { recognitionRef.current.start() } catch (e) { /* ignore */ } }
      else { recognitionActiveRef.current = false; try { recognitionRef.current.stop() } catch (e) { /* ignore */ } }
    }
    if (captionRecognitionRef.current) {
      if (muted) { captionRecognitionActiveRef.current = true; try { captionRecognitionRef.current.start() } catch (e) { /* ignore */ } }
      else { captionRecognitionActiveRef.current = false; try { captionRecognitionRef.current.stop() } catch (e) { /* ignore */ } }
    }
  }

  const others = Object.entries(participants)
  const color = accentColor || C.blue

  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>{t("🎙️ Kanał głosowy")}</span>
          {others.length > 0 && <span style={{ fontSize: 9.5, color: C.muted }}>{others.length} {t("online")}</span>}
          {joined && translateActive && (
            <span style={{ fontSize: 9, color: C.green, fontWeight: 700 }}>
              🌐 {myLang === 'pl' ? t('PL→中文') : t('中文→PL')}
            </span>
          )}
          {joined && captionsActive && (
            <span style={{ fontSize: 9, color: C.green, fontWeight: 700 }}>📝 {t('napisy na żywo')}</span>
          )}
        </div>
        {!joined ? (
          <button onClick={joinCall} disabled={connecting} style={{ padding: '6px 13px', borderRadius: 7, border: 'none', background: color, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', opacity: connecting ? .6 : 1 }}>
            {connecting ? t("Łączenie…") : t("Dołącz")}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleMute} style={{ padding: '6px 11px', borderRadius: 7, border: `1px solid ${C.border}`, background: muted ? C.rlight : '#fff', color: muted ? C.red : C.text2, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
              {muted ? t("🔇 Wyciszony") : t("🎤 Mikrofon")}
            </button>
            <button onClick={leaveCall} style={{ padding: '6px 11px', borderRadius: 7, border: 'none', background: C.red, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{t("Opuść")}</button>
          </div>
        )}
      </div>

      {!joined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
          <select value={myLang} onChange={e => setMyLang(e.target.value)} style={{ padding: '4px 7px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 10, background: '#fff' }}>
            <option value="pl">🇵🇱 {t('Mówię po polsku')}</option>
            <option value="zh">🇨🇳 {t('我说中文 (mówię po chińsku)')}</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={aiTranslate} onChange={e => setAiTranslate(e.target.checked)} />
            {t("🌐 Tłumacz mój głos AI na drugi język")}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={liveCaptions} onChange={e => setLiveCaptions(e.target.checked)} disabled={!chatChannelId} />
            {t("📝 Napisy na żywo (oryginał + tłumaczenie) na czacie")}
          </label>
        </div>
      )}
      {!joined && aiTranslate && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
          {t("Inni usłyszą Twój głos automatycznie przetłumaczony w czasie rzeczywistym. Korzysta z płatnego API OpenAI — nowa funkcja, może wymagać drobnych poprawek przy pierwszym użyciu.")}
        </div>
      )}
      {!joined && liveCaptions && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
          {t("W tym czacie pojawi się rosnąca na żywo wiadomość: oryginał tego co mówisz + tłumaczenie pod nim. Nowa wypowiedź (po dłuższej pauzie) = nowa wiadomość.")}
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>}
      {translateError && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{translateError}</div>}
      {captionsError && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{captionsError}</div>}

      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {others.map(([uid, p]) => {
            const isSpeaking = speakingIds.has(uid)
            return (
              <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', background: avatarColor(p.name),
                  boxShadow: isSpeaking ? `0 0 0 3px ${C.green}` : '0 0 0 2px transparent', transition: 'box-shadow .1s ease',
                }}>{initials(p.name)}</div>
                <span style={{ fontSize: 9, color: C.text2, maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{uid === currentUserId ? t(" (ja)") : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 9, color: C.muted, marginTop: 8 }}>{t(
        "Połączenie bezpośrednie przeglądarka-przeglądarka (WebRTC) — może nie zadziałać w niektórych sieciach firmowych z restrykcyjnym firewallem."
      )}</div>
    </div>
  );
}
