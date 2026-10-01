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

/** Page size in PDF points (scale 1), used to pick a render scale for a target CSS width. */
export async function getPageSize(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height };
}
