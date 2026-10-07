import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import { deleteTags } from './tags';
import type { Attempt, Chunk, NewNote, Note } from './types';

// Parts are identified by Chunk.id, not position (see partId), so per-part data never has to
// move: attempts and exam tags live under parts/{partId}.
//
// All of a user's notes live under users/{uid}/notes/{noteId}; each note keeps its
// chunks (titles, text, last/best score, try count) inline — one small document per
// note keeps the home list a single listener.
//
// Recitation attempts do NOT live on the note: they grow without bound, and every
// change to a note re-sends the whole note document to every open listener. They're
// separate documents at users/{uid}/notes/{noteId}/parts/{partId}/attempts/{id},
// only fetched a page at a time when she opens a part's progress screen
// (single-field `at` ordering, so no composite index is needed).

type Unsubscribe = () => void;

interface NotesStore {
  subscribeNotes(uid: string, cb: (notes: Note[]) => void, onError: (e: Error) => void): Unsubscribe;
  createNote(uid: string, note: NewNote): Promise<string>;
  updateChunk(uid: string, note: Note, index: number, patch: Partial<Chunk>): Promise<void>;
  /** Saves a finished recitation of part `index` as attempt `id`: its own document plus the part's last/best/tries. */
  recordAttempt(uid: string, note: Note, index: number, attempt: Attempt, id: string): Promise<void>;
  /** Up to `size + 1` attempts of one part, newest first, older than `before` (an `at`) when given. */
  pageAttempts(uid: string, noteId: string, partId: string, size: number, before?: number): Promise<Attempt[]>;
  /** Moves history stored on the note by older versions into attempt documents. Idempotent. */
  migrateLegacyHistory(uid: string, note: Note): Promise<void>;
  updateNote(uid: string, id: string, patch: Partial<Pick<Note, 'title' | 'chunks'>>): Promise<void>;
  deleteNote(uid: string, note: Note): Promise<void>;
  /** Deletes part `index` (never the only one) with its attempts and exam tags. Nothing else moves. */
  deleteChunk(uid: string, note: Note, index: number): Promise<void>;
}

/** A part's permanent id; parts saved before ids existed fall back to their position. */
export const partId = (note: Pick<Note, 'chunks'>, index: number): string => note.chunks[index]?.id ?? String(index);

/** A fresh id for a new part. */
export const newPartId = (): string => Math.random().toString(36).slice(2, 10);

/**
 * Chunks with every id filled in. Called on every write of the chunks array, so old notes keep
 * their position-based ids for good, before anything can change their positions.
 */
function withIds(chunks: Chunk[]): Chunk[] {
  return chunks.map((c, i) => (c.id ? c : { ...c, id: String(i) }));
}

function withChunkPatch(note: Note, index: number, patch: Partial<Chunk>): Chunk[] {
  return withIds(note.chunks).map((c, i) => (i === index ? { ...c, ...patch } : c));
}

function scorePatch(c: Chunk | undefined, a: Attempt): Partial<Chunk> {
  return { lastScore: a.percent, bestScore: Math.max(a.percent, c?.bestScore ?? 0), tries: (c?.tries ?? 0) + 1 };
}

export function hasLegacyHistory(note: Note): boolean {
  return note.history !== undefined || note.chunks.some((c) => c.history !== undefined);
}

/** Old on-note history, grouped by part and de-duplicated (chunk.history may repeat note.history). */
function legacyByPart(note: Note): Map<number, Attempt[]> {
  const out = new Map<number, Attempt[]>();
  const add = (part: number, a: Attempt) => {
    const list = out.get(part) ?? [];
    if (!list.some((x) => x.at === a.at)) list.push(a);
    out.set(part, list);
  };
  for (const { part, ...a } of note.history ?? []) add(part, a);
  note.chunks.forEach((c, i) => c.history?.forEach((a) => add(i, a)));
  return out;
}

/** The note's chunks with old history stripped and try counts bumped by what was moved out. */
function migratedChunks(note: Note, moved: Map<number, Attempt[]>): Chunk[] {
  return withIds(note.chunks).map((c, i) => {
    const { history: _drop, ...rest } = c;
    const n = moved.get(i)?.length ?? 0;
    return n ? { ...rest, tries: (c.tries ?? 0) + n } : rest;
  });
}

const attemptsCol = (uid: string, noteId: string, partId: string) =>
  collection(db, 'users', uid, 'notes', noteId, 'parts', partId, 'attempts');

const firestoreStore: NotesStore = {
  subscribeNotes(uid, cb, onError) {
    const q = query(collection(db, 'users', uid, 'notes'), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Note, 'id'>), id: d.id }))),
      onError,
    );
  },
  async createNote(uid, note) {
    const now = Date.now();
    const chunks = note.chunks.map((c) => (c.id ? c : { ...c, id: newPartId() }));
    const ref = await addDoc(collection(db, 'users', uid, 'notes'), { ...note, chunks, createdAt: now, updatedAt: now });
    return ref.id;
  },
  async updateChunk(uid, note, index, patch) {
    await updateDoc(doc(db, 'users', uid, 'notes', note.id), {
      chunks: withChunkPatch(note, index, patch),
      updatedAt: Date.now(),
    });
  },
  async recordAttempt(uid, note, index, attempt, id) {
    const batch = writeBatch(db);
    batch.set(doc(attemptsCol(uid, note.id, partId(note, index)), id), attempt);
    batch.update(doc(db, 'users', uid, 'notes', note.id), {
      chunks: withChunkPatch(note, index, scorePatch(note.chunks[index], attempt)),
      updatedAt: Date.now(),
    });
    await batch.commit();
  },
  async pageAttempts(uid, noteId, part, size, before) {
    const q = query(
      attemptsCol(uid, noteId, part),
      orderBy('at', 'desc'),
      ...(before !== undefined ? [startAfter(before)] : []),
      limit(size + 1),
    );
    return (await getDocs(q)).docs.map((d) => d.data() as Attempt);
  },
  async migrateLegacyHistory(uid, note) {
    if (!hasLegacyHistory(note)) return;
    const moved = legacyByPart(note);
    const batch = writeBatch(db); // a few dozen writes at most — well under the 500 cap
    // Deterministic ids, so a migration that runs twice (two tabs) doesn't duplicate tries.
    for (const [part, list] of moved)
      for (const a of list) batch.set(doc(attemptsCol(uid, note.id, partId(note, part)), `legacy-${a.at}`), a);
    batch.update(doc(db, 'users', uid, 'notes', note.id), { chunks: migratedChunks(note, moved), history: deleteField() });
    await batch.commit();
  },
  async updateNote(uid, id, patch) {
    await updateDoc(doc(db, 'users', uid, 'notes', id), { ...patch, updatedAt: Date.now() });
  },
  async deleteNote(uid, note) {
    // Firestore doesn't delete subcollections with their parent — clear each part's attempts first.
    for (let i = 0; i < note.chunks.length; i++) {
      const snap = await getDocs(attemptsCol(uid, note.id, partId(note, i)));
      for (let j = 0; j < snap.docs.length; j += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(j, j + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await deleteTags(uid, note.id, note.chunks.map((_, i) => partId(note, i)));
    await deleteDoc(doc(db, 'users', uid, 'notes', note.id));
  },
  async deleteChunk(uid, note, index) {
    if (note.chunks.length < 2 || !note.chunks[index]) return;
    const id = partId(note, index);
    // withIds first: the other old parts keep their position-based ids even though positions shift.
    await updateDoc(doc(db, 'users', uid, 'notes', note.id), {
      chunks: withIds(note.chunks).filter((_, i) => i !== index),
      updatedAt: Date.now(),
    });
    const snap = await getDocs(attemptsCol(uid, note.id, id));
    for (let j = 0; j < snap.docs.length; j += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(j, j + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteTags(uid, note.id, [id]);
  },
};

// ---- dev-only in-memory store (VITE_MOCK=1), persisted to localStorage for convenience

const MOCK_KEY = 'study-assistant:mock-notes';
const MOCK_ATTEMPTS_KEY = 'study-assistant:mock-attempts';
type MockAttempts = Record<string, Attempt[]>; // "noteId/partId" → attempts, any order
const listeners = new Set<() => void>();
function mockRead<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function mockWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
const mockLoad = () => mockRead<Note[]>(MOCK_KEY, []);
function mockSave(notes: Note[]) {
  mockWrite(MOCK_KEY, notes);
  listeners.forEach((l) => l());
}
function mockAddAttempts(noteId: string, part: string, list: Attempt[]) {
  const all = mockRead<MockAttempts>(MOCK_ATTEMPTS_KEY, {});
  const key = `${noteId}/${part}`;
  const have = all[key] ?? [];
  all[key] = [...have, ...list.filter((a) => !have.some((h) => h.at === a.at))];
  mockWrite(MOCK_ATTEMPTS_KEY, all);
}
const mockUpdate = (id: string, f: (n: Note) => Note) => mockSave(mockLoad().map((n) => (n.id === id ? f(n) : n)));

const mockStore: NotesStore = {
  subscribeNotes(_uid, cb) {
    const emit = () => cb(mockLoad().sort((a, b) => b.updatedAt - a.updatedAt));
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  },
  async createNote(_uid, note) {
    const id = Math.random().toString(36).slice(2, 10);
    const now = Date.now();
    const chunks = note.chunks.map((c) => (c.id ? c : { ...c, id: newPartId() }));
    mockSave([...mockLoad(), { ...note, chunks, id, createdAt: now, updatedAt: now }]);
    return id;
  },
  async updateChunk(_uid, note, index, patch) {
    mockUpdate(note.id, (n) => ({ ...n, chunks: withChunkPatch(n, index, patch), updatedAt: Date.now() }));
  },
  async recordAttempt(_uid, note, index, attempt, _id) {
    mockAddAttempts(note.id, partId(note, index), [attempt]);
    mockUpdate(note.id, (n) => ({
      ...n,
      chunks: withChunkPatch(n, index, scorePatch(n.chunks[index], attempt)),
      updatedAt: Date.now(),
    }));
  },
  async pageAttempts(_uid, noteId, part, size, before) {
    const list = mockRead<MockAttempts>(MOCK_ATTEMPTS_KEY, {})[`${noteId}/${part}`] ?? [];
    return list
      .filter((a) => before === undefined || a.at < before)
      .sort((a, b) => b.at - a.at)
      .slice(0, size + 1);
  },
  async migrateLegacyHistory(_uid, note) {
    if (!hasLegacyHistory(note)) return;
    const moved = legacyByPart(note);
    for (const [part, list] of moved) mockAddAttempts(note.id, partId(note, part), list);
    mockUpdate(note.id, ({ history: _drop, ...n }) => ({ ...n, chunks: migratedChunks(note, moved) }));
  },
  async updateNote(_uid, id, patch) {
    mockUpdate(id, (n) => ({ ...n, ...patch, updatedAt: Date.now() }));
  },
  async deleteNote(_uid, note) {
    const all = mockRead<MockAttempts>(MOCK_ATTEMPTS_KEY, {});
    for (const key of Object.keys(all)) if (key.startsWith(`${note.id}/`)) delete all[key];
    mockWrite(MOCK_ATTEMPTS_KEY, all);
    await deleteTags(_uid, note.id, note.chunks.map((_, i) => partId(note, i)));
    mockSave(mockLoad().filter((n) => n.id !== note.id));
  },
  async deleteChunk(uid, note, index) {
    if (note.chunks.length < 2 || !note.chunks[index]) return;
    const id = partId(note, index);
    mockUpdate(note.id, (n) => ({ ...n, chunks: withIds(n.chunks).filter((_, i) => i !== index), updatedAt: Date.now() }));
    const all = mockRead<MockAttempts>(MOCK_ATTEMPTS_KEY, {});
    delete all[`${note.id}/${id}`];
    mockWrite(MOCK_ATTEMPTS_KEY, all);
    await deleteTags(uid, note.id, [id]);
  },
};

export const notesStore: NotesStore = MOCK ? mockStore : firestoreStore;
