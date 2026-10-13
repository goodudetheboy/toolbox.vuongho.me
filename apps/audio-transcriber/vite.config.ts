import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/audio-transcriber/',
  plugins: [react()],
  worker: {
    // ES output: the workers are created with { type: 'module' }, and
    // parakeet.js code-splits (dynamic onnxruntime-web import), which IIFE
    // worker bundles can't do.
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@huggingface/transformers'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
