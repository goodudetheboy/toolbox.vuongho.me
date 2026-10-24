import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/njtransit-bus/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // Installable app, scoped to /njtransit-bus/ only (same plugin as study-assistant
    // and churn-machine; see docs/adr/0002-installable-pwa.md). The shell is precached
    // so it opens instantly; bus times always come live from the API, never a cache.
    // `autoUpdate`: nothing on the board is worth protecting from a reload.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: BASE,
        name: 'NJ Transit Bus',
        short_name: 'Bus',
        description: 'When the next NJ Transit bus leaves your stop, live, with the Port Authority gate.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackAllowlist: [new RegExp(`^${BASE}`)],
        // The watch app download (wear/, ADR 0003) must reach the network, not the app shell.
        navigateFallbackDenylist: [/\.apk$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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
});
