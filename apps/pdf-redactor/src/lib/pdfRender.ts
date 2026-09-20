import type { PDFDocumentProxy } from 'pdfjs-dist';

export async function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a 2D canvas context');

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}
