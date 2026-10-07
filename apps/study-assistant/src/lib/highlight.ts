import { normalize } from './words';

// Marks a word range of a part on its rendered reading card (opened from a cram-sheet card),
// with the CSS Custom Highlight API: nothing in the React-rendered DOM is touched, and
// browsers without it simply show no highlight.
//
// Word indices are tokenize(markdown)'s, so this walks the rendered text the same way: words
// split on whitespace, words with no letters/digits skipped, heading text skipped unless the
// part is nothing but headings. If the count doesn't match tokenize's (odd markdown), it gives
// up rather than mark the wrong words.

const NAME = 'cram-source';

interface Pos {
  node: Text;
  offset: number;
}

interface Word {
  start: Pos;
  end: Pos;
  text: string;
}

const BLOCK = 'p,li,td,th,h1,h2,h3,h4,h5,h6,blockquote';

function words(root: HTMLElement, includeHeadings: boolean): Word[] {
  const out: Word[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (!includeHeadings && n.parentElement?.closest('h1,h2,h3,h4,h5,h6') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  // Text nodes can split a word ("**term**:" renders as <strong>term</strong>":"), so a word
  // continues into the next text node until whitespace or a new block (paragraph, list item…).
  let cur: Word | null = null;
  let block: Element | null = null;
  const flush = () => {
    if (cur && normalize(cur.text)) out.push(cur);
    cur = null;
  };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCK) ?? null;
    if (b !== block) {
      flush();
      block = b;
    }
    const re = /\S+|\s+/g;
    for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
      if (/^\s/.test(m[0])) {
        flush();
      } else if (cur && m.index === 0) {
        cur.end = { node: n, offset: m[0].length };
        cur.text += m[0];
      } else {
        flush();
        cur = { start: { node: n, offset: m.index }, end: { node: n, offset: m.index + m[0].length }, text: m[0] };
      }
    }
  }
  flush();
  return out;
}

/** Highlights words start..end (inclusive) inside `root`; returns the range to scroll to, or null. */
export function highlightWords(root: HTMLElement, start: number, end: number, expected: number): Range | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return null;
  let list = words(root, false);
  if (list.length === 0) list = words(root, true);
  if (list.length !== expected || end >= expected) return null;
  const range = document.createRange();
  range.setStart(list[start].start.node, list[start].start.offset);
  range.setEnd(list[end].end.node, list[end].end.offset);
  CSS.highlights.set(NAME, new Highlight(range));
  return range;
}

export function clearHighlight(): void {
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) CSS.highlights.delete(NAME);
}
