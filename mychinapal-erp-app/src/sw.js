// Własny Service Worker (strategia injectManifest) — zastępuje wcześniejszy,
// automatycznie generowany przez vite-plugin-pwa (generateSW), żeby móc dodać
// obsługę powiadomień push ("jak WhatsApp": powiadomienie na telefonie nawet
// gdy appka jest zamknięta/w tle).
//
// WAŻNE: reguły cache'owania poniżej to świadome odtworzenie wcześniejszej
// konfiguracji generateSW z vite.config.js — priorytet ma zawsze świeży kod
// (NetworkFirst), a nie działanie offline, bo to aktywnie rozwijana aplikacja
// z częstymi wdrożeniami. Nie zmieniaj tego na CacheFirst.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'

self.skipWaiting()
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly())
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'html-cache', networkTimeoutSeconds: 5 }))
registerRoute(({ request }) => ['script', 'style'].includes(request.destination), new NetworkFirst({ cacheName: 'asset-cache', networkTimeoutSeconds: 5 }))

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// --- Powiadomienia push ---

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = { title: 'MyChinaPal', body: event.data ? event.data.text() : '' } }

  const title = payload.title || 'MyChinaPal'
  // Wzmianki @Ktoś dostają mocniejsze powiadomienie: zostaje na ekranie
  // dopóki go nie dotkniesz (requireInteraction) i inny wzorzec wibracji,
  // żeby dało się je odróżnić od zwykłej nowej wiadomości na czacie.
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || undefined, // ta sama "tag" (np. channel_id) grupuje/podmienia powiadomienia z tego samego kanału zamiast je mnożyć
    renotify: !!payload.mention,
    requireInteraction: !!payload.mention,
    data: { url: payload.url || '/czat' },
    vibrate: payload.mention ? [200, 100, 200, 100, 200] : [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/czat'
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) { try { await client.navigate(url) } catch {} }
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
