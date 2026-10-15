import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/churn-machine/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // Installable app, scoped to /churn-machine/ only (same setup as study-assistant,
    // see docs/adr/0004-installable-pwa.md). The shell is precached; deals.json is
    // network-first so it's fresh online and still there offline.
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: BASE,
        name: 'Churn Machine',
        short_name: 'Churn',
        description: 'Bank account bonuses, a paycheck plan, and a record of your accounts.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#f7f7f5',
        theme_color: '#f7f7f5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Plan', url: `${BASE}plan` },
          { name: 'My accounts', url: `${BASE}accounts` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        navigateFallbackAllowlist: [new RegExp(`^${BASE}`)],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Serialized into sw.js on its own, so no closure variables (BASE) here.
            urlPattern: /\/churn-machine\/deals\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'churn-deals', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  // Firebase is most of the main chunk and needed on first paint.
  build: { chunkSizeWarningLimit: 1100 },
});
