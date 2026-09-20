import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageRedactions } from '../types';
import { renderPageToCanvas } from './pdfRender';

const EXPORT_SCALE = 150 / 72;
const JPEG_QUALITY = 0.92;
const MAX_WORKERS = 8;
const MAIN_THREAD_CONCURRENCY = 4;

export type ExportFormat = 'png' | 'jpeg';

export interface ExportOptions {
  format?: ExportFormat;
  onProgress?: (done: number, total: number) => void;
}

interface RenderedPage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function buildRedactedPdf(
  pdfDoc: PDFDocumentProxy,
  originalBytes: ArrayBuffer,
  redactions: PageRedactions,
  { format = 'png', onProgress }: ExportOptions = {},
): Promise<Uint8Array> {
  const total = pdfDoc.numPages;
  const pagesNeedingRedaction: number[] = [];
  const passthroughPages: number[] = [];
  for (let p = 1; p <= total; p++) {
    if (redactions[p] && redactions[p].length > 0) {
      pagesNeedingRedaction.push(p);
    } else {
      passthroughPages.push(p);
    }
  }

  let completed = 0;
  function reportProgress() {
    completed++;
    onProgress?.(completed, total);
  }

  const rendered = new Map<number, RenderedPage>();

  if (pagesNeedingRedaction.length > 0) {
    if (supportsOffscreenCanvasRendering()) {
      await renderPagesInWorkerPool(originalBytes, pagesNeedingRedaction, redactions, format, rendered, reportProgress);
    } else {
      await renderPagesOnMainThread(pdfDoc, pagesNeedingRedaction, redactions, format, rendered, reportProgress);
    }
  }

  const outDoc = await PdfLibDocument.create();

  // Pages with no redaction boxes never need to be rasterized at all — copy
  // them straight from the source PDF, keeping native vector text and
  // skipping the render/encode cost entirely.
  let copiedPages: Awaited<ReturnType<typeof outDoc.copyPages>> = [];
  if (passthroughPages.length > 0) {
    const srcDoc = await PdfLibDocument.load(originalBytes);
    copiedPages = await outDoc.copyPages(
      srcDoc,
      passthroughPages.map((p) => p - 1),
    );
  }
  const copiedByPageNumber = new Map<number, (typeof copiedPages)[number]>();
  passthroughPages.forEach((p, i) => copiedByPageNumber.set(p, copiedPages[i]));

  for (let p = 1; p <= total; p++) {
    const page = rendered.get(p);
    if (page) {
      const image = format === 'jpeg' ? await outDoc.embedJpg(page.bytes) : await outDoc.embedPng(page.bytes);
      const outPage = outDoc.addPage([page.width, page.height]);
      outPage.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    } else {
      outDoc.addPage(copiedByPageNumber.get(p)!);
      reportProgress();
    }
  }

  return outDoc.save();
}

function supportsOffscreenCanvasRendering(): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined';
}

// True multi-core rendering: a pool of real Worker threads, each with its
// own pdf.js instance and OffscreenCanvas, pulling pages off a shared queue.
async function renderPagesInWorkerPool(
  pdfBytes: ArrayBuffer,
  pageNumbers: number[],
  redactions: PageRedactions,
  format: ExportFormat,
  rendered: Map<number, RenderedPage>,
  onPageDone: () => void,
): Promise<void> {
  const workerCount = Math.max(
    1,
    Math.min(MAX_WORKERS, navigator.hardwareConcurrency || 4, pageNumbers.length),
  );

  const workers = Array.from(
    { length: workerCount },
    () => new Worker(new URL('../workers/renderWorker.ts', import.meta.url), { type: 'module' }),
  );

  try {
    // Each worker parses its own independent copy of the document, so every
    // worker needs its own copy of the bytes (a transferred ArrayBuffer's
    // ownership moves to a single recipient).
    await Promise.all(workers.map((w) => initWorker(w, pdfBytes.slice(0))));

    let cursor = 0;
    const nextPageNumber = () => (cursor < pageNumbers.length ? pageNumbers[cursor++] : null);

    function runOnWorker(worker: Worker): Promise<void> {
      return new Promise((resolve, reject) => {
        function requestNext() {
          const pageNumber = nextPageNumber();
          if (pageNumber === null) {
            worker.onmessage = null;
            resolve();
            return;
          }
          worker.postMessage({
            type: 'renderPage',
            pageNumber,
            scale: EXPORT_SCALE,
            rects: redactions[pageNumber] ?? [],
            format,
            jpegQuality: JPEG_QUALITY,
          });
        }

        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === 'pageRendered') {
            rendered.set(msg.pageNumber, {
              bytes: new Uint8Array(msg.bytes),
              width: msg.width,
              height: msg.height,
            });
            onPageDone();
            requestNext();
          } else if (msg.type === 'pageError') {
            reject(new Error(`Failed to render page ${msg.pageNumber}: ${msg.message}`));
          }
        };

        requestNext();
      });
    }

    await Promise.all(workers.map(runOnWorker));
  } finally {
    workers.forEach((w) => w.terminate());
  }
}

function initWorker(worker: Worker, pdfBytes: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'ready') resolve();
      else if (e.data?.type === 'initError') reject(new Error(e.data.message));
    };
    worker.onerror = (e) => reject(e.error ?? new Error('Worker failed to initialize'));
    worker.postMessage({ type: 'init', pdfBytes }, [pdfBytes]);
  });
}

// Fallback for browsers without OffscreenCanvas: concurrency-limited async
// scheduling on the main thread (not true parallelism, but still better
// than one page at a time).
async function renderPagesOnMainThread(
  pdfDoc: PDFDocumentProxy,
  pageNumbers: number[],
  redactions: PageRedactions,
  format: ExportFormat,
  rendered: Map<number, RenderedPage>,
  onPageDone: () => void,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < pageNumbers.length) {
      const pageNumber = pageNumbers[cursor++];
      const canvas = await renderPageToCanvas(pdfDoc, pageNumber, EXPORT_SCALE);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get a 2D canvas context');

      ctx.fillStyle = '#000000';
      for (const rect of redactions[pageNumber] ?? []) {
        ctx.fillRect(
          rect.x * canvas.width,
          rect.y * canvas.height,
          rect.width * canvas.width,
          rect.height * canvas.height,
        );
      }

      const bytes = await canvasToImageBytes(canvas, format);
      rendered.set(pageNumber, { bytes, width: canvas.width, height: canvas.height });
      onPageDone();
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAIN_THREAD_CONCURRENCY, pageNumbers.length) }, worker));
}

function canvasToImageBytes(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Uint8Array> {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? JPEG_QUALITY : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode page'));
          return;
        }
        blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)))
          .catch(reject);
      },
      mime,
      quality,
    );
  });
}
