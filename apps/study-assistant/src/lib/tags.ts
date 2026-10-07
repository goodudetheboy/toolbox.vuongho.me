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

/** Used when Gemini can't be reached: one idea per displayed line, all "supporting". */
export function fallbackTags(tokens: Token[]): TaggedIdea[] {
  const ideas: TaggedIdea[] = [];
  tokens.forEach((tk, i) => {
    if (i === 0 || tk.line !== tokens[i - 1].line) ideas.push({ start: i, end: i, importance: 2 });
    else ideas[ideas.length - 1].end = i;
  });
  return ideas;
}

const BATCH = 40; // the API's per-request limit

/** Asks Gemini for these parts' tags and saves them. Throws if the API fails. */
export async function tagParts(uid: string, parts: PartText[]): Promise<PartTags[]> {
  const out: PartTags[] = [];
  for (let i = 0; i < parts.length; i += BATCH) {
    const batch = parts.slice(i, i + BATCH).map((p) => ({ ...p, hash: textHash(p.markdown), words: tokenize(p.markdown).map((t) => t.display) }));
    const sendable = batch.filter((p) => p.words.length > 0);
    const res = sendable.length ? await api.tag(sendable.map((p) => ({ words: p.words }))) : { parts: [], model: '' };
    let k = 0;
    for (const p of batch) {
      const tags: PartTags = { ideas: p.words.length ? res.parts[k++]?.ideas ?? [] : [], ideasHash: p.hash };
      out.push(tags);
      // Saving is best-effort: the sheet already has the tags in hand.
      save(uid, p.noteId, p.part, tags, res.model).catch(() => {});
    }
  }
  return out;
}

/** After a note is created or a part edited: tag in the background so the cram sheet is instant later. */
export function tagInBackground(uid: string, parts: PartText[]): void {
  if (parts.length) tagParts(uid, parts).catch(() => {}); // the cram sheet re-tags anything still stale
}

/**
 * Tags for each part, in order: saved ones whose hash still matches the text, everything else
 * tagged now in one batch. If Gemini fails, those parts get fallbackTags (not saved), so the
 * cram sheet always works — even offline.
 */
export async function ensureTags(uid: string, parts: PartText[]): Promise<TaggedIdea[][]> {
  const saved = await Promise.all(parts.map((p) => load(uid, p.noteId, p.part).catch(() => null)));
  const result: (TaggedIdea[] | null)[] = saved.map((s, i) => (s && s.ideasHash === textHash(parts[i].markdown) ? s.ideas : null));
  const stale = parts.map((p, i) => ({ p, i })).filter(({ i }) => result[i] === null);
  if (stale.length) {
    try {
      const fresh = await tagParts(uid, stale.map(({ p }) => p));
      stale.forEach(({ i }, k) => (result[i] = fresh[k].ideas));
    } catch {
      for (const { p, i } of stale) result[i] = fallbackTags(tokenize(p.markdown));
    }
  }
  return result as TaggedIdea[][];
}
