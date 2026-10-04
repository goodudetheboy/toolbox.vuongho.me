import type { PrepareInput } from './api';

// Turns whatever she picked (pasted text, a Word file, PDFs, photos) into the
// /prepare request. Word files are converted to HTML in the browser so their
// headings/lists/bold survive (Gemini can't read .docx directly); PDFs and
// photos go to Gemini as-is, photos shrunk first to keep uploads quick.

const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_SIDE = 2000;

export class ImportError extends Error {}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fileToBase64(file: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

async function shrinkPhoto(file: File): Promise<{ data: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (blob) return { data: await fileToBase64(blob), mimeType: 'image/jpeg' };
  } catch {
    // Browser can't decode it (e.g. HEIC on Chrome) — Gemini can, send the original.
  }
  return { data: await fileToBase64(file), mimeType: file.type || 'image/jpeg' };
}

const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type.includes('wordprocessingml');
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isText = (f: File) => /^text\//.test(f.type) || /\.(txt|md)$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);

export async function inputFromFiles(files: File[]): Promise<PrepareInput> {
  if (files.length === 0) throw new ImportError('no-files');
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES * 2) throw new ImportError('too-big');

  // A single Word or text file → text-based input (keeps the verbatim check).
  if (files.length === 1 && isDocx(files[0])) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await files[0].arrayBuffer() });
    return { kind: 'html', text: value };
  }
  if (files.length === 1 && isText(files[0])) {
    return { kind: 'text', text: await files[0].text() };
  }

  const parts: { data: string; mimeType: string }[] = [];
  for (const f of files) {
    if (isPdf(f)) parts.push({ data: await fileToBase64(f), mimeType: 'application/pdf' });
    else if (isImage(f)) parts.push(await shrinkPhoto(f));
    else throw new ImportError('unsupported');
  }
  const encoded = parts.reduce((n, p) => n + p.data.length * 0.75, 0);
  if (encoded > MAX_TOTAL_BYTES) throw new ImportError('too-big');
  return { kind: 'files', files: parts };
}
