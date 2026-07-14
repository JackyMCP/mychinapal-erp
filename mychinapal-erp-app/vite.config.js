import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest zamiast domyślnego generateSW: potrzebujemy własnego
      // kodu w Service Workerze do obsługi powiadomień push ("jak WhatsApp").
      // Cały poprzedni runtimeCaching (NetworkFirst/NetworkOnly) jest teraz
      // ręcznie odtworzony w src/sw.js — patrz komentarz w tamtym pliku.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{png,svg,ico}'],
      },
      includeAssets: ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyChinaPal ERP',
        short_name: 'MyChinaPal',
        description: 'System ERP MyChinaPal Sp. z o.o.',
        theme_color: '#0A1628',
        background_color: '#0A1628',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'pl',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // WAŻNE: to jest aktywnie rozwijana aplikacja z częstymi wdrożeniami —
        // priorytet ma zawsze świeży kod, nie działanie offline. Dlatego
        // precache'ujemy tylko ikony (rzadko się zmieniają), a HTML/JS/CSS
        // zawsze próbują najpierw sieci (NetworkFirst) — bez tego przeglądarka
        // potrafiła serwować starą, zbuforowaną wersję strony/logiki logowania
        // aż do ręcznego odświeżenia.
        globPatterns: ['**/*.{png,svg,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html-cache', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: ({ request }) => ['script', 'style'].includes(request.destination),
            handler: 'NetworkFirst',
            options: { cacheName: 'asset-cache', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
})
