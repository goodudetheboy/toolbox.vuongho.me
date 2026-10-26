import { createContext, useContext, useEffect, useState } from 'react';
import { deleteDoc, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import { decodeImage } from './decodeImage';

// Pictures inside a part. Markdown refers to one as `![](img:ID)`; the picture itself is a
// shrunk WebP data URL in its own document at users/{uid}/notes/{noteId}/images/{ID} (so the
// note document stays small; the notes rule already covers everything under a note, and the
// offline cache keeps them on the device). Tokenizing turns an image into its alt text, which
// is always empty, so pictures are never recited, graded or read aloud.

const PREFIX = 'img:';
const REF = /!\[[^\]]*\]\(img:([\w-]+)\)/g;
/** Firestore's limit is 1 MiB a document; stay well under it. */
const MAX_CHARS = 600_000;
const MAX_SIDE = 1400;

export const imageMarkdown = (id: string): string => `![](${PREFIX}${id})`;
export const imageIdFromSrc = (src: string | null | undefined): string | null =>
  src?.startsWith(PREFIX) && /^[\w-]+$/.test(src.slice(PREFIX.length)) ? src.slice(PREFIX.length) : null;

/** Every picture a part's markdown shows. */
export function imageIds(md: string): string[] {
  return [...new Set([...md.matchAll(REF)].map((m) => m[1]))];
}

const cache = new Map<string, string>(); // id → data URL
const unsaved = new Set<string>(); // prepared here, not in the store yet

/** Shrinks a picture to a WebP data URL small enough for one document. */
export async function prepareImage(file: Blob): Promise<{ id: string; dataUrl: string }> {
  const bitmap = await decodeImage(file);
  let side = MAX_SIDE;
  let quality = 0.82;
  for (;;) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent screenshots read better on white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality); // Safari < 17
    if (dataUrl.length <= MAX_CHARS || side < 300) {
      bitmap.close();
      const id = Math.random().toString(36).slice(2, 12);
      cache.set(id, dataUrl);
      unsaved.add(id);
      return { id, dataUrl };
    }
    if (quality > 0.6) quality -= 0.12;
    else side = Math.round(side * 0.75);
  }
}

// ---- store

const MOCK_KEY = 'study-assistant:mock-images';
const mockAll = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '{}');
  } catch {
    return {};
  }
};
const imageDoc = (uid: string, noteId: string, id: string) => doc(db, 'users', uid, 'notes', noteId, 'images', id);

async function loadImage(uid: string, noteId: string, id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const data = MOCK ? mockAll()[id] : ((await getDoc(imageDoc(uid, noteId, id))).data()?.data as string | undefined);
  if (data) cache.set(id, data);
  return data ?? null;
}

/** Stores the pictures among `ids` that were prepared on this device and not stored yet. */
export async function saveImages(uid: string, noteId: string, ids: string[]): Promise<void> {
  const fresh = ids.filter((id) => unsaved.has(id));
  if (!fresh.length) return;
  if (MOCK) {
    const all = mockAll();
    for (const id of fresh) all[id] = cache.get(id)!;
    localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    fresh.forEach((id) => unsaved.delete(id));
    return;
  }
  // One picture can be ~600 KB and a batch is capped at 10 MiB: a few per batch.
  for (let i = 0; i < fresh.length; i += 8) {
    const batch = writeBatch(db);
    for (const id of fresh.slice(i, i + 8)) batch.set(imageDoc(uid, noteId, id), { data: cache.get(id), at: Date.now() });
    await batch.commit();
  }
  fresh.forEach((id) => unsaved.delete(id));
}

export async function deleteImages(uid: string, noteId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (MOCK) {
    const all = mockAll();
    for (const id of ids) delete all[id];
    localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    return;
  }
  await Promise.all(ids.map((id) => deleteDoc(imageDoc(uid, noteId, id))));
}

// ---- showing them

/** Whose pictures a rendered part shows; set around the note screens. */
export const ImageOwner = createContext<{ uid: string; noteId: string } | null>(null);

/** A picture's data URL once loaded (null while loading or if it's gone). */
export function useImage(id: string | null): string | null {
  const owner = useContext(ImageOwner);
  const [url, setUrl] = useState(() => (id ? cache.get(id) ?? null : null));
  useEffect(() => {
    if (!id) return setUrl(null);
    const hit = cache.get(id);
    if (hit) return setUrl(hit);
    if (!owner) return;
    let live = true;
    loadImage(owner.uid, owner.noteId, id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, owner?.uid, owner?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

/** Fills in every `<img src="img:ID">` under `root` (the rich editor's own DOM). */
export async function resolveImagesIn(root: HTMLElement, uid: string, noteId: string): Promise<void> {
  await Promise.all(
    [...root.querySelectorAll('img')].map(async (img) => {
      const id = img.dataset.img ?? imageIdFromSrc(img.getAttribute('src'));
      if (!id) return;
      img.dataset.img = id;
      const url = await loadImage(uid, noteId, id).catch(() => null);
      if (url) img.src = url;
    }),
  );
}
