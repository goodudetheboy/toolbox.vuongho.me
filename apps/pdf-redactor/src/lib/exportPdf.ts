import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageRedactions } from '../types';
import { renderPageToCanvas } from './pdfRender';

const EXPORT_SCALE = 150 / 72;

export async function buildRedactedPdf(
  pdfDoc: PDFDocumentProxy,
  redactions: PageRedactions,
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
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

    const pngBytes = await canvasToPng(canvas);
    const image = await outDoc.embedPng(pngBytes);
    const page = outDoc.addPage([canvas.width, canvas.height]);
    page.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  }

  return outDoc.save();
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode page as PNG'));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, 'image/png');
  });
}
