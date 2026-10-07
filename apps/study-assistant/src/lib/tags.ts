import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { api } from './api';
import { db } from './firebase';
import { textHash } from './marks';
import { MOCK } from './mock';
import type { TaggedIdea } from './types';
import { tokenize, type Token } from './words';

// Exam importance tags: Gemini splits a part into ideas and rates each 1-3, once. They're
// saved at users/{uid}/notes/{noteId}/parts/{part} — beside that part's attempts, not on the
// note, so tagging never rewrites the note document (no race with scores) and the Home
// listener doesn't carry them. `ideasHash` is textHash() of the markdown that was SENT to
// Gemini: if she edits the part (even while a request is in flight), the hash no longer
// matches and the part is simply tagged again the next time a cram sheet needs it.
// Word indices refer to tokenize(markdown) — the same words attempt marks use.

export interface PartTags {
  ideas: TaggedIdea[];
  ideasHash: string;
}

export interface PartText {
  noteId: string;
  part: number;
  markdown: string;
}

const MOCK_KEY = 'study-assistant:mock-tags';
const mockAll = (): Record<string, PartTags> => {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '{}');
  } catch {
    return {};
  }
};

const partDoc = (uid: string, noteId: string, part: number) => doc(db, 'users', uid, 'notes', noteId, 'parts', String(part));

async function load(uid: string, noteId: string, part: number): Promise<PartTags | null> {
  if (MOCK) return mockAll()[`${noteId}/${part}`] ?? null;
  const snap = await getDoc(partDoc(uid, noteId, part));
  const data = snap.data() as Partial<PartTags> | undefined;
  return data?.ideas && data.ideasHash ? { ideas: data.ideas, ideasHash: data.ideasHash } : null;
}

async function save(uid: string, noteId: string, part: number, tags: PartTags, model: string): Promise<void> {
  if (MOCK) {
    const all = mockAll();
    all[`${noteId}/${part}`] = tags;
    localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    return;
  }
  await setDoc(partDoc(uid, noteId, part), { ...tags, model, taggedAt: Date.now() }, { merge: true });
}

/** Removes a deleted note's tag documents (notesStore.deleteNote). */
export async function deleteTags(uid: string, noteId: string, parts: number): Promise<void> {
  if (MOCK) {
    const all = mockAll();
    for (let i = 0; i < parts; i++) delete all[`${noteId}/${i}`];
    localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    return;
  }
  await Promise.all(Array.from({ length: parts }, (_, i) => deleteDoc(partDoc(uid, noteId, i))));
}

/** After part `index` of a `total`-part note is deleted: drop its tags, move later parts' down one. */
export async function shiftTagsAfterDelete(uid: string, noteId: string, index: number, total: number): Promise<void> {
  if (MOCK) {
    const all = mockAll();
    delete all[`${noteId}/${index}`];
    for (let j = index + 1; j < total; j++) {
      const k = `${noteId}/${j}`;
      if (all[k]) all[`${noteId}/${j - 1}`] = all[k];
      else delete all[`${noteId}/${j - 1}`];
      delete all[k];
    }
    localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    return;
  }
  await deleteDoc(partDoc(uid, noteId, index));
  for (let j = index + 1; j < total; j++) {
    const snap = await getDoc(partDoc(uid, noteId, j));
    if (snap.exists()) await setDoc(partDoc(uid, noteId, j - 1), snap.data());
    await deleteDoc(partDoc(uid, noteId, j));
  }
}

/** Used when Gemini can't be reached: one idea per displayed line, all "supporting". */
export function fallbackTags(tokens: Token[]): TaggedIdea[] {
  const ideas: TaggedIdea[] = [];
  tokens.forEach((tk, i) => {
    if (i === 0 || tk.line !== tokens[i - 1].line) ideas.push({ start: i, end: i, importance: 2 });
    else ideas[ideas.length - 1].end = i;
  });
  return ideas;
}

/** Parts per /tag request (the API allows 40; smaller batches are faster and less likely to be skipped). */
const BATCH = 20;
/** /tag requests in flight at once, for a long note. */
const PARALLEL = 3;
/** The API's per-part limit; a bigger part only ever gets fallbackTags. */
const MAX_WORDS = 2000;

/**
 * Asks Gemini for these parts' tags and saves them, in order. null = no tags this time (Gemini
 * skipped the part, its request failed, or it's over MAX_WORDS) — nothing is saved, so it's asked
 * again next time. Never throws.
 */
export async function tagParts(uid: string, parts: PartText[]): Promise<(PartTags | null)[]> {
  const items = parts.map((p) => ({ ...p, hash: textHash(p.markdown), words: tokenize(p.markdown).map((t) => t.display) }));
  const sendable = items.filter((p) => p.words.length > 0 && p.words.length <= MAX_WORDS);
  const batches: (typeof sendable)[] = [];
  for (let i = 0; i < sendable.length; i += BATCH) batches.push(sendable.slice(i, i + BATCH));

  const got = new Map<(typeof items)[number], PartTags>();
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      let res;
      try {
        res = await api.tag(batch.map((p) => ({ words: p.words })));
      } catch {
        continue; // this batch stays untagged (null); the other batches still count
      }
      batch.forEach((p, k) => {
        const ideas = res.parts[k]?.ideas;
        if (!ideas) return;
        const tags = { ideas, ideasHash: p.hash };
        got.set(p, tags);
        // Saving is best-effort: the sheet already has the tags in hand.
        save(uid, p.noteId, p.part, tags, res.model).catch(() => {});
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  // A part with no words has nothing to rank: an empty list is its (saved-free) answer.
  return items.map((p) => got.get(p) ?? (p.words.length === 0 ? { ideas: [], ideasHash: p.hash } : null));
}

/** After a note is created or a part edited: tag in the background so the cram sheet is instant later. */
export function tagInBackground(uid: string, parts: PartText[]): void {
  if (parts.length) void tagParts(uid, parts); // the cram sheet re-tags anything still stale
}

/**
 * Tags for each part, in order: saved ones whose hash still matches the text, everything else
 * tagged now (batched, a few requests in parallel for a long note). Any part that still has no
 * tags — Gemini failed or skipped it, or it's too long — gets fallbackTags (not saved), so the
 * cram sheet always works, even offline.
 */
export async function ensureTags(uid: string, parts: PartText[]): Promise<TaggedIdea[][]> {
  const saved = await Promise.all(parts.map((p) => load(uid, p.noteId, p.part).catch(() => null)));
  const result: (TaggedIdea[] | null)[] = saved.map((s, i) => (s && s.ideasHash === textHash(parts[i].markdown) ? s.ideas : null));
  const stale = parts.map((p, i) => ({ p, i })).filter(({ i }) => result[i] === null);
  if (stale.length) {
    const fresh = await tagParts(uid, stale.map(({ p }) => p));
    stale.forEach(({ p, i }, k) => (result[i] = fresh[k]?.ideas ?? fallbackTags(tokenize(p.markdown))));
  }
  return result as TaggedIdea[][];
}
