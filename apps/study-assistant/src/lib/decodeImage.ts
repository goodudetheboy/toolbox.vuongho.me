// Phone photos are often HEIC (iPhones, Samsung's "high efficiency" setting). Safari decodes
// those itself, Chrome/Firefox don't, and some pickers hand over HEIC with an empty file type.
// So: try the browser first, and only if it can't decode the picture load the HEIC decoder
// (libheif in WebAssembly, ~3 MB, its own lazy chunk kept out of the PWA precache).

const HEIC_NAME = /\.(heic|heif)$/i;

/** True for anything that's a picture, including HEIC files the browser left untyped. */
export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || HEIC_NAME.test(f.name);

/** What the file input should offer: every picture, plus HEIC spelled out for pickers that need it. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/** A decoded picture, whatever its format. Throws if it really isn't one. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch (err) {
    const { heicTo } = await import('heic-to');
    // Not HEIC either → it really isn't a picture we can read; report the browser's error.
    return heicTo({ blob: file, type: 'bitmap' }).catch(() => Promise.reject(err));
  }
}
