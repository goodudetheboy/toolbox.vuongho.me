import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/study-assistant/',
  plugins: [react()],
  // Firebase (auth + Firestore) is most of the main chunk; it's needed on first paint anyway.
  build: { chunkSizeWarningLimit: 1100 },
});
