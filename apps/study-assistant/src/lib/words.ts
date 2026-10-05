// Turns a chunk's Markdown into the word list she recites, and matches what the
// speech recognizer heard against it — forgiving of accent and mis-hearing,
// strict about short common words so "the" said anywhere doesn't earn credit.

export interface Token {
  /** The word as shown, punctuation included. */
  display: string;
  /** Lowercase letters/digits only — what matching compares. */
  norm: string;
  /** Which displayed line (paragraph, list item, table row) it belongs to. */
  line: number;
}

/** Markdown → one plain-text string per visible line (headings, list items, table rows…). */
export function markdownLines(md: string): string[] {
  return md
    .split('\n')
    .filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)) // table separator rows
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, '') // heading marks
        .replace(/^\s*>\s?/, '') // blockquote
        .replace(/^\s*([-*+]|\d+[.)])\s+/, '') // list markers
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → their text
        .replace(/\|/g, ' ') // table cell borders
        .replace(/(?<!\\)(\*\*|__|\*|_|~~|`)/g, '') // emphasis/code marks
        .replace(/\\([^\p{L}\p{N}\s])/gu, '$1') // backslash escapes from the editor ("1\.", "\*")
        .trim(),
    )
    .filter(Boolean);
}

export function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Words she recites. Heading lines are labels, not content, so they're skipped
 * (unless the chunk is nothing but headings).
 */
export function tokenize(md: string): Token[] {
  const body = md
    .split('\n')
    .filter((l) => !/^\s{0,3}#{1,6}\s/.test(l))
    .join('\n');
  const tokens: Token[] = [];
  markdownLines(body.trim() ? body : md).forEach((line, lineIndex) => {
    for (const display of line.split(/\s+/)) {
      const norm = normalize(display);
      if (norm) tokens.push({ display, norm, line: lineIndex });
    }
  });
  return tokens;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = tmp;
    }
  }
  return dp[b.length];
}

/** Rough sound-alike key: consonant skeleton with common spelling variants merged. */
function skeleton(w: string): string {
  return w
    .replace(/ph/g, 'f')
    .replace(/c(?=[eiy])/g, 's') // soft c: "cyte" ~ "site"
    .replace(/[ckq]/g, 'k')
    .replace(/z/g, 's')
    .replace(/[aeiouyh]/g, '')
    .replace(/(.)\1+/g, '$1');
}

/** Does a heard word plausibly stand for the target word? */
export function wordsMatch(heard: string, target: string): boolean {
  if (heard === target) return true;
  if (target.length < 4) return false; // short words must be exact
  if (levenshtein(heard, target) <= Math.floor(target.length / 4)) return true;
  return target.length >= 5 && skeleton(heard).length >= 3 && skeleton(heard) === skeleton(target);
}

export interface Alignment {
  /** Indices of chunk tokens she has said. */
  said: Set<number>;
  /** Index just after the last token she said — where she is "up to". */
  cursor: number;
}

// How far ahead of where she is a heard word may jump without being "out of order".
const WINDOW = 6;

/**
 * Walks the heard words and credits chunk tokens. In-order matches near the
 * cursor are preferred; a longer word may also match anywhere unclaimed, since
 * reciting parts out of order is fine. Recognizers sometimes split one long
 * term into several words ("ery throw site"), so up to three heard words are
 * also tried joined together.
 */
export function align(tokens: Token[], heardText: string): Alignment {
  const heard = heardText.split(/\s+/).map(normalize).filter(Boolean);
  const said = new Set<number>();
  let cursor = 0;

  const findNear = (w: string): number => {
    for (let j = cursor; j < Math.min(tokens.length, cursor + WINDOW); j++) {
      if (!said.has(j) && wordsMatch(w, tokens[j].norm)) return j;
    }
    return -1;
  };
  const findAnywhere = (w: string): number => {
    let best = -1;
    for (let j = 0; j < tokens.length; j++) {
      if (said.has(j) || tokens[j].norm.length < 4 || !wordsMatch(w, tokens[j].norm)) continue;
      if (best < 0 || Math.abs(j - cursor) < Math.abs(best - cursor)) best = j;
    }
    return best;
  };

  for (let i = 0; i < heard.length; ) {
    let matched = -1;
    let used = 1;
    for (const k of [3, 2, 1]) {
      if (i + k > heard.length) continue;
      const joined = heard.slice(i, i + k).join('');
      if (k > 1 && joined.length < 6) continue;
      const j = findNear(joined);
      if (j >= 0) {
        matched = j;
        used = k;
        break;
      }
    }
    if (matched < 0) {
      for (const k of [3, 2, 1]) {
        if (i + k > heard.length) continue;
        const joined = heard.slice(i, i + k).join('');
        if (k > 1 && joined.length < 6) continue;
        const j = findAnywhere(joined);
        if (j >= 0) {
          matched = j;
          used = k;
          break;
        }
      }
    }
    if (matched >= 0) {
      said.add(matched);
      cursor = matched + 1;
    }
    i += used;
  }
  return { said, cursor };
}

/** The next `count` token indices she hasn't said yet, starting where she's up to. */
export function nextHint(tokens: Token[], alignment: Alignment, count: number): number[] {
  let start = -1;
  for (let j = alignment.cursor; j < tokens.length; j++) {
    if (!alignment.said.has(j)) {
      start = j;
      break;
    }
  }
  if (start < 0) {
    for (let j = 0; j < tokens.length; j++) {
      if (!alignment.said.has(j)) {
        start = j;
        break;
      }
    }
  }
  if (start < 0) return [];
  const out: number[] = [];
  for (let j = start; j < tokens.length && out.length < count; j++) out.push(j);
  return out;
}

/**
 * Up to `max` token indices from `start`, stopping at the end of a sentence or
 * clause (once there are a few words) or of the line — the verbatim fallback hint.
 */
export function phraseFrom(tokens: Token[], start: number, max = 10): number[] {
  const out: number[] = [];
  for (let j = start; j < tokens.length && out.length < max; j++) {
    if (out.length > 0 && tokens[j].line !== tokens[start].line) break;
    out.push(j);
    if (out.length >= 3 && /[.;:!?]$/.test(tokens[j].display)) break;
  }
  return out;
}
