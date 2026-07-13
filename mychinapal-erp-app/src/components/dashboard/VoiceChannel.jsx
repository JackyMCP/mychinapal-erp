import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'
import { avatarColor, initials } from '../klienci/utils'

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function VoiceChannel({ roomId, currentUserId, currentUserName, accentColor }) {
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
    const { data, error: fnErr } = await supabase.functions.invoke('openai-realtime-token', { body: { target_language: targetLang } })
    if (fnErr) throw new Error('token: ' + fnErr.message)
    if (!data?.ok) throw new Error(data?.error || 'nieznany błąd tokenu OpenAI')
    const ephemeralKey = data.client_secret

    const pc = new RTCPeerConnection()
    translatorPcRef.current = pc

    const remoteStream = new MediaStream()
    pc.ontrack = (e) => { e.streams[0]?.getTracks().forEach(tr => remoteStream.addTrack(tr)) }

    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    })
    if (!sdpRes.ok) throw new Error('OpenAI odrzuciło połączenie (kod ' + sdpRes.status + ')')
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
  function setupSpeechToTextPipeline() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) throw new Error('ta przeglądarka nie wspiera rozpoznawania mowy (działa w Chrome/Edge)')

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const dest = audioCtx.createMediaStreamDestination()
    audioCtxRef.current = audioCtx
    destNodeRef.current = dest

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = async (event) => {
      const result = event.results[event.results.length - 1]
      if (!result?.isFinal) return
      const text = result[0]?.transcript?.trim()
      if (!text) return
      try {
        const { data: trData } = await supabase.functions.invoke('translate-text', { body: { text, to: 'pl' } })
        if (!trData?.ok || !trData.translated) return

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token || supabaseAnonKey

        const ttsRes = await fetch(`${supabaseUrl}/functions/v1/tts-speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: trData.translated }),
        })
        if (!ttsRes.ok || !audioCtxRef.current) return
        const arrBuf = await ttsRes.arrayBuffer()
        const audioBuf = await audioCtxRef.current.decodeAudioData(arrBuf)
        const src = audioCtxRef.current.createBufferSource()
        src.buffer = audioBuf
        src.connect(destNodeRef.current)
        src.start()
      } catch (e) { /* pojedyncza wypowiedź się nie udała — nasłuch trwa dalej */ }
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
    setConnecting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      let outgoing = stream
      if (aiTranslate) {
        try {
          outgoing = myLang === 'pl' ? await setupOpenAITranslator('zh') : setupSpeechToTextPipeline()
          setTranslateActive(true)
        } catch (e) {
          setTranslateError(t('Tłumaczenie AI niedostępne (') + e.message + t(') — rozmowa idzie dalej Twoim naturalnym głosem.'))
          outgoing = stream
        }
      }
      outgoingStreamRef.current = outgoing

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
        </div>
      )}
      {!joined && aiTranslate && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
          {t("Inni usłyszą Twój głos automatycznie przetłumaczony w czasie rzeczywistym. Korzysta z płatnego API OpenAI — nowa funkcja, może wymagać drobnych poprawek przy pierwszym użyciu.")}
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>}
      {translateError && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{translateError}</div>}

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
