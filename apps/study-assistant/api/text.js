// Pure text helpers shared by the endpoints — no Gemini, no I/O, so they're unit-tested
// directly (text.test.js).

/** Lowercased words with markdown syntax and punctuation stripped, for verbatim checks. */
export function words(text) {
  return text
    .replace(/<[^>]+>/g, ' ') // HTML tags (Word documents arrive as HTML)
    .replace(/&nbsp;/g, ' ')
    .replace(/[*_`#>|~[\]()]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * How much of `source` survives, in order, in `output`: 2·LCS / (|a| + |b|) over words.
 * 1 = identical word sequence. Used to catch Gemini paraphrasing a pasted note.
 */
export function sequenceSimilarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Int32Array(b.length + 1);
  let curr = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}
