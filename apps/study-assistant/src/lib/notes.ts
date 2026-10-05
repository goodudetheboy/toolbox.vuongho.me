import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import type { Attempt, Chunk, NewNote, Note } from './types';

// All of a user's notes live under users/{uid}/notes/{noteId}; each note keeps its
// chunks (and their scores) inline — one document per note keeps sync simple and
// stays far below Firestore's 1 MB document limit for any realistic study note.

type Unsubscribe = () => void;

interface NotesStore {
  subscribeNotes(uid: string, cb: (notes: Note[]) => void, onError: (e: Error) => void): Unsubscribe;
  subscribeNote(uid: string, id: string, cb: (note: Note | null) => void, onError: (e: Error) => void): Unsubscribe;
  createNote(uid: string, note: NewNote): Promise<string>;
  updateChunk(uid: string, note: Note, index: number, patch: Partial<Chunk>): Promise<void>;
  /** Saves a finished recitation of part `index`: its last/best score plus a history entry. */
  recordAttempt(uid: string, note: Note, index: number, attempt: Attempt): Promise<void>;
  updateNote(uid: string, id: string, patch: Partial<Pick<Note, 'title' | 'chunks'>>): Promise<void>;
  deleteNote(uid: string, id: string): Promise<void>;
}

function withChunkPatch(note: Note, index: number, patch: Partial<Chunk>): Chunk[] {
  return note.chunks.map((c, i) => (i === index ? { ...c, ...patch } : c));
}

function attemptPatch(note: Note, index: number, a: Attempt): Partial<Chunk> {
  const c = note.chunks[index];
  return {
    lastScore: a.percent,
    bestScore: Math.max(a.percent, c?.bestScore ?? 0),
    history: [...chunkHistory(note, index), a],
  };
}

/** A part's attempts, oldest first — its own plus any from the old note-level history. */
export function chunkHistory(note: Note, index: number): Attempt[] {
  const own = note.chunks[index]?.history;
  if (own) return own;
  return (note.history ?? []).filter((a) => a.part === index).map(({ at, percent, hints }) => ({ at, percent, hints }));
}

const firestoreStore: NotesStore = {
  subscribeNotes(uid, cb, onError) {
    const q = query(collection(db, 'users', uid, 'notes'), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Note, 'id'>), id: d.id }))),
      onError,
    );
  },
  subscribeNote(uid, id, cb, onError) {
    return onSnapshot(
      doc(db, 'users', uid, 'notes', id),
      (snap) => cb(snap.exists() ? { ...(snap.data() as Omit<Note, 'id'>), id: snap.id } : null),
      onError,
    );
  },
  async createNote(uid, note) {
    const now = Date.now();
    const ref = await addDoc(collection(db, 'users', uid, 'notes'), { ...note, createdAt: now, updatedAt: now });
    return ref.id;
  },
  async updateChunk(uid, note, index, patch) {
    await updateDoc(doc(db, 'users', uid, 'notes', note.id), {
      chunks: withChunkPatch(note, index, patch),
      updatedAt: Date.now(),
    });
  },
  async recordAttempt(uid, note, index, attempt) {
    await updateDoc(doc(db, 'users', uid, 'notes', note.id), {
      chunks: withChunkPatch(note, index, attemptPatch(note, index, attempt)),
      updatedAt: Date.now(),
    });
  },
  async updateNote(uid, id, patch) {
    await updateDoc(doc(db, 'users', uid, 'notes', id), { ...patch, updatedAt: Date.now() });
  },
  async deleteNote(uid, id) {
    await deleteDoc(doc(db, 'users', uid, 'notes', id));
  },
};

// ---- dev-only in-memory store (VITE_MOCK=1), persisted to localStorage for convenience

const MOCK_KEY = 'study-assistant:mock-notes';
const listeners = new Set<() => void>();
function mockLoad(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '[]') as Note[];
  } catch {
    return [];
  }
}
function mockSave(notes: Note[]) {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

const mockStore: NotesStore = {
  subscribeNotes(_uid, cb) {
    const emit = () => cb(mockLoad().sort((a, b) => b.updatedAt - a.updatedAt));
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  },
  subscribeNote(_uid, id, cb) {
    const emit = () => cb(mockLoad().find((n) => n.id === id) ?? null);
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  },
  async createNote(_uid, note) {
    const id = Math.random().toString(36).slice(2, 10);
    const now = Date.now();
    mockSave([...mockLoad(), { ...note, id, createdAt: now, updatedAt: now }]);
    return id;
  },
  async updateChunk(_uid, note, index, patch) {
    mockSave(
      mockLoad().map((n) =>
        n.id === note.id ? { ...n, chunks: withChunkPatch(n, index, patch), updatedAt: Date.now() } : n,
      ),
    );
  },
  async recordAttempt(_uid, note, index, attempt) {
    mockSave(
      mockLoad().map((n) =>
        n.id === note.id
          ? {
              ...n,
              chunks: withChunkPatch(n, index, attemptPatch(n, index, attempt)),
              updatedAt: Date.now(),
            }
          : n,
      ),
    );
  },
  async updateNote(_uid, id, patch) {
    mockSave(mockLoad().map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  },
  async deleteNote(_uid, id) {
    mockSave(mockLoad().filter((n) => n.id !== id));
  },
};

export const notesStore: NotesStore = MOCK ? mockStore : firestoreStore;
