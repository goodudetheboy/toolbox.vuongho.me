import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/study-assistant/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // Installable PWA. The service worker precaches the built app shell so it opens
    // instantly and offline-ish (notes come from Firestore's own IndexedDB cache).
    // `prompt`, not `autoUpdate`: a new version waits for her to tap "Update" in
    // UpdateToast, so it never reloads in the middle of a recitation.
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: BASE,
        name: 'Study with Biggu',
        short_name: 'Biggu',
        description: 'Read a study note, recite it, and let Biggu help when you get stuck.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#DCEFFB',
        theme_color: '#DCEFFB',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything, lazy chunks included (~380 kB gzipped, once): splitting the Word importer
        // out pulled shared CommonJS helpers into its chunk and made every load fetch it.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,m4a}'],
        // The Firebase-heavy main chunk is ~1 MB; the default 2 MB cap is fine but make it explicit.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Deep links (/study-assistant/n/…) open the cached shell, like Hosting's rewrite does.
        navigateFallback: `${BASE}index.html`,
        navigateFallbackAllowlist: [new RegExp(`^${BASE}`)],
        cleanupOutdatedCaches: true,
        // Take over open pages on activate: the "Update" button reloads when control changes, which
        // never happens for a page opened before the first worker installed. (Activation itself still
        // only happens when she taps Update — no skipWaiting here.)
        clientsClaim: true,
        runtimeCaching: [
          // Google Fonts: the CSS changes rarely, the font files never — cache both.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // Firebase (auth + Firestore) is most of the main chunk; it's needed on first paint anyway.
  build: { chunkSizeWarningLimit: 1100 },
});
