// Compact per-word record of a recitation, saved with each attempt so the
// progress history can show what she got, was hinted, or missed — one letter
// per recitable word, plus a hash of the part's text to tell when it was edited
// since (then the letters no longer line up with the words).

import type { WordStatus } from './useRecitation';

const CODE: Record<WordStatus, string> = { said: 's', hinted: 'h', missed: 'm' };
const STATUS: Record<string, WordStatus> = { s: 'said', h: 'hinted', m: 'missed' };

export function encodeMarks(statuses: WordStatus[]): string {
  return statuses.map((s) => CODE[s]).join('');
}

export function decodeMarks(marks: string): WordStatus[] {
  return [...marks].map((c) => STATUS[c] ?? 'missed');
}

/**
 * The part's text minus pasted pictures (`![](img:ID)`, see lib/images.ts), so adding or
 * removing a picture doesn't count as a text change: her past tries keep their colored words
 * and exam tags aren't redone. Text with no pictures comes back unchanged, so hashes saved
 * before pictures existed still match.
 */
export function withoutPictures(text: string): string {
  if (!/!\[[^\]]*\]\(img:[\w-]+\)/.test(text)) return text;
  return text
    .replace(/ ?!\[[^\]]*\]\(img:[\w-]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** FNV-1a, 8 hex chars — only needs to notice that a part's words changed (pictures don't count). */
export function textHash(raw: string): string {
  const text = withoutPictures(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
