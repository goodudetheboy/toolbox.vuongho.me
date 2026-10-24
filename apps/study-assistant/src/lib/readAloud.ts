import type { Token } from './words';

// Splits a part into pieces Biggu reads aloud one at a time (/speak takes ≤300 characters).
// A piece ends at a sentence end or a new line (paragraph, list item…) once it's long enough
// to sound natural, and always before it would pass the limit.

export const PIECE_MAX_CHARS = 280;
const PIECE_MIN_CHARS = 60;

export interface Piece {
  /** First and last word index (inclusive), for the follow-along highlight. */
  from: number;
  to: number;
  text: string;
}

export function speechPieces(tokens: Token[], max = PIECE_MAX_CHARS): Piece[] {
  const out: Piece[] = [];
  let from = 0;
  let text = '';
  const flush = (to: number) => {
    if (text) out.push({ from, to, text });
    from = to + 1;
    text = '';
  };
  tokens.forEach((tk, i) => {
    // Markdown leftovers (a lone "|" or "-") would be read out as symbols.
    const word = tk.display.replace(/[*_`#|]/g, '');
    if (text && text.length + 1 + word.length > max) flush(i - 1);
    text = text ? `${text} ${word}` : word;
    const next = tokens[i + 1];
    const sentenceEnd = /[.!?;:]["')\]]*$/.test(tk.display);
    const lineEnd = !next || next.line !== tk.line;
    if (!next || ((sentenceEnd || lineEnd) && text.length >= PIECE_MIN_CHARS) || (lineEnd && sentenceEnd)) flush(i);
  });
  return out;
}
