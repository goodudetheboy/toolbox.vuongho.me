// Little notes of encouragement tucked between cram-sheet cards. Where they go is random per
// sheet visit (a seed picked when the sheet opens) but depends only on that seed and the card
// position, so "give meow more" and re-sorting never move a note that's already on screen.

/** Chance that a visit's first note is Vpork's instead (only on VPORK_EMAIL's account). */
export const VPORK_CHANCE = 0.1;
export const VPORK_EMAIL = 'tling241004@gmail.com';

/** At least this many cards between two notes, and the chance of a note at each eligible gap. */
const MIN_GAP = 5;
const NOTE_CHANCE = 0.25;

/** Small seeded PRNG (mulberry32): same seed → same sequence. */
function rand(seed: number): number {
  let a = seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface CheerSlot {
  /** Shown right after the card at this index. */
  after: number;
  /** Index into the messages list (callers take it modulo the list length). */
  message: number;
  vpork: boolean;
}

/** Notes for a sheet showing `cards` cards: never before the first card or after the last. */
export function cheerSlots(seed: number, cards: number, vporkAllowed: boolean, vporkChance = VPORK_CHANCE): CheerSlot[] {
  const slots: CheerSlot[] = [];
  let last = -MIN_GAP;
  for (let i = 1; i < cards - 1; i++) {
    if (i - last < MIN_GAP || rand(seed + i * 7919) >= NOTE_CHANCE) continue;
    slots.push({ after: i, message: Math.floor(rand(seed + i * 104729) * 1e6), vpork: false });
    last = i;
  }
  if (vporkAllowed && slots.length && rand(seed ^ 0x5bd1e995) < vporkChance) slots[0].vpork = true;
  return slots;
}
