import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
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

  const channelRef = useRef(null)
  const localStreamRef = useRef(null)
  const peersRef = useRef({})       // userId -> RTCPeerConnection
  const audioElsRef = useRef({})    // userId -> HTMLAudioElement
  const analysersRef = useRef({})   // userId -> { analyser, data }
  const rafRef = useRef(null)
  const joinedRef = useRef(false)

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
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))

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

  async function joinCall() {
    setError('')
    setConnecting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
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
    localStreamRef.current?.getTracks().forEach(row => row.stop())
    localStreamRef.current = null
    if (joinedRef.current) channelRef.current?.untrack()
    joinedRef.current = false
    setJoined(false)
    setMuted(false)
    setSpeakingIds(new Set())
  }

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = muted; setMuted(m => !m) }
  }

  const others = Object.entries(participants)
  const color = accentColor || C.blue

  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>{t("🎙️ Kanał głosowy")}</span>
          {others.length > 0 && <span style={{ fontSize: 9.5, color: C.muted }}>{others.length} {t("online")}</span>}
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
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>}
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
