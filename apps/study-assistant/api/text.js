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

/** Unwraps code fences and outdents 4+-space lines (not list items), which Markdown would show as raw code. */
export function cleanMarkdown(md) {
  return String(md)
    .replace(/^\s*```[\w-]*\s*$/gm, '')
    .replace(/^(?: {4,}|\t+)(?![-*+] |\d+[.)] )/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turns Gemini's per-idea grading into the result: percent = average idea score weighted by idea
 * length (a one-word aside counts less than a full definition); a 0-score idea is missed whole.
 */
export function gradeIdeas(result, wordCount) {
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < wordCount;
  const missed = new Set();
  let weighted = 0;
  let covered = 0;
  for (const idea of Array.isArray(result.ideas) ? result.ideas : []) {
    if (!valid(idea.start) || !valid(idea.end) || idea.end < idea.start) continue;
    const len = idea.end - idea.start + 1;
    const pct = Math.max(0, Math.min(100, Number(idea.score) || 0));
    weighted += pct * len;
    covered += len;
    for (const i of idea.missed || []) if (valid(i)) missed.add(i);
    if (pct === 0) for (let i = idea.start; i <= idea.end; i++) missed.add(i);
  }
  if (covered === 0) throw new Error('Gemini returned no ideas');
  return { percent: Math.round(weighted / covered), missed: [...missed].sort((a, b) => a - b) };
}
