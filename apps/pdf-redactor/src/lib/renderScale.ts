import { OPS, type PDFPageProxy } from 'pdfjs-dist';

const POINTS_PER_INCH = 72;

// Vector/text content has no native resolution to match, so this is a
// fixed print-legible default rather than something derived from the PDF.
const DEFAULT_DPI = 100;

// When a page turns out to be a single full-page scanned image, match its
// real resolution instead — but clamp both ends: don't upscale a low-res
// scan beyond what's actually there, and don't blow up the export size
// matching an unnecessarily high-res source scan either.
const MIN_NATIVE_DPI = 72;
const MAX_NATIVE_DPI = 200;

// A page's content is one image spanning (approximately) the full page --
// the common "scanned document" case -- if there's exactly one image draw
// operation and its aspect ratio roughly matches the page's.
const ASPECT_RATIO_TOLERANCE = 0.15;

export async function resolvePageScale(page: PDFPageProxy): Promise<number> {
  const nativeDpi = await detectNativeDpi(page);
  const dpi = nativeDpi === null ? DEFAULT_DPI : Math.min(MAX_NATIVE_DPI, Math.max(MIN_NATIVE_DPI, nativeDpi));
  return dpi / POINTS_PER_INCH;
}

async function detectNativeDpi(page: PDFPageProxy): Promise<number | null> {
  const viewport = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();

  const objIds = new Set<string>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const objId = opList.argsArray[i]?.[0];
      if (typeof objId === 'string') objIds.add(objId);
    }
  }

  if (objIds.size !== 1) return null;
  const [objId] = objIds;

  const imgData = await new Promise<{ width?: number; height?: number } | undefined>((resolve) => {
    page.objs.get(objId, resolve);
  });
  if (!imgData?.width || !imgData.height) return null;

  const imageAspect = imgData.width / imgData.height;
  const pageAspect = viewport.width / viewport.height;
  if (Math.abs(imageAspect - pageAspect) / pageAspect > ASPECT_RATIO_TOLERANCE) return null;

  const pixelsPerPoint = imgData.width / viewport.width;
  return pixelsPerPoint * POINTS_PER_INCH;
}
