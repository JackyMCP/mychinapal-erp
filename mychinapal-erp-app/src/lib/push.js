import { supabase } from './supabaseClient'

// Klucz publiczny VAPID — bezpieczny do umieszczenia w kodzie front-endu
// (odpowiednik klucza prywatnego siedzi wyłącznie w sekretach Edge Function
// send-chat-push w Supabase). Ustaw w .env / zmiennych środowiskowych Vercel:
// VITE_VAPID_PUBLIC_KEY
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

export function pushPermissionState() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

// Prosi o zgodę (jeśli trzeba) i zapisuje subskrypcję push w bazie dla
// aktualnie zalogowanego użytkownika. Zwraca true/false (sukces).
export async function enablePushNotifications() {
  if (!isPushSupported()) return false
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    let sub = await registration.pushManager.getSubscription()
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth_key: json.keys?.auth,
    }, { onConflict: 'endpoint' })
    if (error) { console.error('Nie udało się zapisać subskrypcji push', error); return false }
    return true
  } catch (e) {
    console.error('enablePushNotifications', e)
    return false
  }
}

export async function isPushEnabled() {
  if (!isPushSupported()) return false
  if (Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
