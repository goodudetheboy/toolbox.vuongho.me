// @ts-nocheck
// Runs inside a dedicated Web Worker so page rasterization happens on its
// own OS thread (via OffscreenCanvas), not the main thread. Mixing DOM and
// WebWorker lib types in one tsconfig is awkward without a separate worker
// project, so this file is excluded from typechecking; correctness is
// verified by running it in the browser instead.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { resolvePageScale } from '../lib/renderScale';

// pdf.js's normal path spawns its own nested Worker to do parsing, but its
// spawn code unconditionally reads `window.location` -- which doesn't
// exist here, since we ARE a Worker. That throws every time, and pdf.js
// catches it and falls back to "fake worker" mode (parsing runs directly
// in this thread instead) -- which is exactly the architecture we want
// anyway, so no further worker is needed. `workerSrc` still needs to be a
// non-empty value even though the nested worker it would point to never
// actually gets used -- some internal pdf.js code paths read it directly
// and throw "No GlobalWorkerOptions.workerSrc specified" otherwise (only
// surfaced in the production build, not the Vite dev server, which is why
// this slipped through initial testing here).
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

// The fake-worker path still defaults to a DOM-based canvas factory though
// (`document.createElement`), which also doesn't exist here, so we supply
// an OffscreenCanvas-backed one explicitly. `disableFontFace` avoids a
// similar assumption for custom embedded fonts (browser FontFace
// registration is main-thread/DOM only); pdf.js falls back to its own
// internal glyph rendering instead.
class OffscreenCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

let docPromise = null;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      docPromise = getDocument({
        data: msg.pdfBytes,
        CanvasFactory: OffscreenCanvasFactory,
        disableFontFace: true,
      }).promise;
      await docPromise;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'initError', message: err?.message ?? String(err) });
    }
    return;
  }

  if (msg.type === 'renderPage') {
    const { pageNumber, rects, format, jpegQuality } = msg;
    try {
      const doc = await docPromise;
      const page = await doc.getPage(pageNumber);
      const scale = await resolvePageScale(page);
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
