// Exam cram sheet ranking — plain arithmetic, no model call (ADR 0001, "exam cram sheets").
// Gemini only tagged each idea's importance once (lib/tags.ts); her grades decide the rest:
//
//   miss_t     = (missed + 0.5 × hinted) / words in the idea      for each try t
//   weight_t   = 0.7^(tries since t)                              newest try = 1
//   weakness   = (Σ weight_t × miss_t + 2 × 0.5) / (Σ weight_t + 2)
//   relevance  = importance × weakness
//
// The "+ 2 × 0.5" is two pretend tries at 50%: an idea never tried scores 0.5, and one lucky
// or unlucky try can't push it to 0 or 1. Same inputs → same order (ties: exam order).

export const DECAY = 0.7;
export const PRIOR_TRIES = 2;
export const PRIOR_WEAKNESS = 0.5;
/** How many recent tries per part count — a try 10 back weighs 0.7^9 ≈ 4% of the newest. */
export const RECENT_TRIES = 10;
/** One "give meow more" load: ~5 minutes at ~200 words a minute. */
export const WORDS_PER_PAGE = 1000;

export interface CramIdea {
  /** Stable across loads while the part's text is unchanged (used for ticks + React keys). */
  key: string;
  /** Position in the exam: which note (in exam order), which part, which word. Breaks ties. */
  noteOrder: number;
  part: number;
  start: number;
  end: number;
  importance: 1 | 2 | 3;
  /** This part's tries' marks (s/h/m per word), newest first; only tries of the current text. */
  marks: string[];
}

export function weakness(idea: Pick<CramIdea, 'start' | 'end' | 'marks'>): number {
  const len = idea.end - idea.start + 1;
  let sum = 0;
  let weights = 0;
  idea.marks.forEach((m, t) => {
    let miss = 0;
    for (let i = idea.start; i <= idea.end; i++) miss += m[i] === 'm' ? 1 : m[i] === 'h' ? 0.5 : 0;
    const w = DECAY ** t;
    sum += w * (miss / len);
    weights += w;
  });
  return (sum + PRIOR_TRIES * PRIOR_WEAKNESS) / (weights + PRIOR_TRIES);
}

export const relevance = (idea: CramIdea) => idea.importance * weakness(idea);

export type CramSort = 'relevant' | 'important';

const examOrder = (a: CramIdea, b: CramIdea) => a.noteOrder - b.noteOrder || a.part - b.part || a.start - b.start;

/** "Most relevant" = importance × weakness; "Most important" = importance only. Highest first. */
export function rankIdeas<T extends CramIdea>(ideas: T[], sort: CramSort): T[] {
  const score = new Map(ideas.map((x) => [x.key, sort === 'relevant' ? relevance(x) : x.importance]));
  return [...ideas].sort((a, b) => score.get(b.key)! - score.get(a.key)! || examOrder(a, b));
}

/**
 * How many of the ranked ideas fit in `pages` loads of WORDS_PER_PAGE. An idea is never split:
 * ideas are added while the total is under the budget, so a load can run a little over.
 */
export function countForPages(ranked: Pick<CramIdea, 'start' | 'end'>[], pages: number): number {
  const budget = pages * WORDS_PER_PAGE;
  let words = 0;
  let n = 0;
  while (n < ranked.length && words < budget) {
    words += ranked[n].end - ranked[n].start + 1;
    n++;
  }
  return n;
}
