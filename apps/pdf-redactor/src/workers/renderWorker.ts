// @ts-nocheck
// Runs inside a dedicated Web Worker so page rasterization happens on its
// own OS thread (via OffscreenCanvas), not the main thread. Mixing DOM and
// WebWorker lib types in one tsconfig is awkward without a separate worker
// project, so this file is excluded from typechecking; correctness is
// verified by running it in the browser instead.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

let docPromise = null;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      docPromise = getDocument({ data: msg.pdfBytes }).promise;
      await docPromise;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'initError', message: err?.message ?? String(err) });
    }
    return;
  }

  if (msg.type === 'renderPage') {
    const { pageNumber, scale, rects, format, jpegQuality } = msg;
    try {
      const doc = await docPromise;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      ctx.fillStyle = '#000000';
      for (const rect of rects) {
        ctx.fillRect(
          rect.x * canvas.width,
          rect.y * canvas.height,
          rect.width * canvas.width,
          rect.height * canvas.height,
        );
      }

      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const blob = await canvas.convertToBlob(
        format === 'jpeg' ? { type: mime, quality: jpegQuality } : { type: mime },
      );
      const buffer = await blob.arrayBuffer();

      self.postMessage(
        { type: 'pageRendered', pageNumber, bytes: buffer, width: canvas.width, height: canvas.height },
        [buffer],
      );
    } catch (err) {
      self.postMessage({ type: 'pageError', pageNumber, message: err?.message ?? String(err) });
    }
  }
};
