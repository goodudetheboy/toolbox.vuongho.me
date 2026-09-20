import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageRedactions } from '../types';
import { renderPageToCanvas } from './pdfRender';

const EXPORT_SCALE = 150 / 72;
const JPEG_QUALITY = 0.92;
const CONCURRENCY = 4;

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
  redactions: PageRedactions,
  { format = 'png', onProgress }: ExportOptions = {},
): Promise<Uint8Array> {
  const total = pdfDoc.numPages;
  const pages: RenderedPage[] = new Array(total);
  let completed = 0;

  async function processPage(pageNumber: number) {
    const canvas = await renderPageToCanvas(pdfDoc, pageNumber, EXPORT_SCALE);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a 2D canvas context');

    context.fillStyle = '#000000';
    for (const rect of redactions[pageNumber] ?? []) {
      context.fillRect(
        rect.x * canvas.width,
        rect.y * canvas.height,
        rect.width * canvas.width,
        rect.height * canvas.height,
      );
    }

    const bytes = await canvasToImageBytes(canvas, format);
    pages[pageNumber - 1] = { bytes, width: canvas.width, height: canvas.height };

    completed++;
    onProgress?.(completed, total);
  }

  // Concurrency-limited worker pool: renders/encodes several pages at once
  // instead of strictly one-at-a-time, without spiking memory on large PDFs.
  const pageNumbers = Array.from({ length: total }, (_, i) => i + 1);
  let cursor = 0;
  async function worker() {
    while (cursor < pageNumbers.length) {
      const pageNumber = pageNumbers[cursor++];
      await processPage(pageNumber);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  const outDoc = await PDFDocument.create();
  for (const { bytes, width, height } of pages) {
    const image = format === 'jpeg' ? await outDoc.embedJpg(bytes) : await outDoc.embedPng(bytes);
    const page = outDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  return outDoc.save();
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
