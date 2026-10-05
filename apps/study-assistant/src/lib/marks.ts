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

/** FNV-1a, 8 hex chars — only needs to notice that a part's text changed. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
