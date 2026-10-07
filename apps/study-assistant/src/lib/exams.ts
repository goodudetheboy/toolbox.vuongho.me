import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import type { Exam, NewExam, Note } from './types';

// Exams live at users/{uid}/exams/{examId}: a name, a date and which notes (or parts) they cover.
// Nothing else is stored — the cram sheet is rebuilt from tags + attempts each time it opens
// (lib/cram.ts), and its "I remember this" ticks stay on the device (lib/ticks.ts).

type Unsubscribe = () => void;

interface ExamsStore {
  subscribe(uid: string, cb: (exams: Exam[]) => void, onError: (e: Error) => void): Unsubscribe;
  create(uid: string, exam: NewExam): Promise<string>;
  update(uid: string, id: string, patch: Partial<NewExam>): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}

const examsCol = (uid: string) => collection(db, 'users', uid, 'exams');

const firestoreStore: ExamsStore = {
  subscribe(uid, cb, onError) {
    return onSnapshot(examsCol(uid), (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Exam, 'id'>), id: d.id }))), onError);
  },
  async create(uid, exam) {
    const now = Date.now();
    return (await addDoc(examsCol(uid), { ...exam, createdAt: now, updatedAt: now })).id;
  },
  async update(uid, id, patch) {
    await updateDoc(doc(db, 'users', uid, 'exams', id), { ...patch, updatedAt: Date.now() });
  },
  async remove(uid, id) {
    await deleteDoc(doc(db, 'users', uid, 'exams', id));
  },
};

const MOCK_KEY = 'study-assistant:mock-exams';
const listeners = new Set<() => void>();
const mockLoad = (): Exam[] => {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '[]');
  } catch {
    return [];
  }
};
const mockSave = (exams: Exam[]) => {
  localStorage.setItem(MOCK_KEY, JSON.stringify(exams));
  listeners.forEach((l) => l());
};

const mockStore: ExamsStore = {
  subscribe(_uid, cb) {
    const emit = () => cb(mockLoad());
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  },
  async create(_uid, exam) {
    const id = Math.random().toString(36).slice(2, 10);
    const now = Date.now();
    mockSave([...mockLoad(), { ...exam, id, createdAt: now, updatedAt: now }]);
    return id;
  },
  async update(_uid, id, patch) {
    mockSave(mockLoad().map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)));
  },
  async remove(_uid, id) {
    mockSave(mockLoad().filter((e) => e.id !== id));
  },
};

export const examsStore: ExamsStore = MOCK ? mockStore : firestoreStore;

/** Today as YYYY-MM-DD in local time (what <input type="date"> uses). */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Whole days from today to the exam date: 0 = today, negative = past. */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

/** Upcoming exams soonest first, then past ones most recent first. */
export function sortExams(exams: Exam[], now = new Date()): Exam[] {
  return [...exams].sort((a, b) => {
    const da = daysUntil(a.date, now);
    const db_ = daysUntil(b.date, now);
    if (da >= 0 !== db_ >= 0) return da >= 0 ? -1 : 1;
    return da >= 0 ? da - db_ : db_ - da;
  });
}

/** The exam's parts that still exist, in exam order (deleted notes/parts are skipped). */
export function examParts(exam: Exam, notes: Note[]): { note: Note; part: number }[] {
  const out: { note: Note; part: number }[] = [];
  for (const pick of exam.notes) {
    const note = notes.find((n) => n.id === pick.noteId);
    if (!note) continue;
    const parts = pick.parts ?? note.chunks.map((_, i) => i);
    for (const part of parts) if (note.chunks[part]) out.push({ note, part });
  }
  return out;
}

/** How many of the exam's notes still exist. */
export const examNoteCount = (exam: Exam, notes: Note[]) => exam.notes.filter((p) => notes.some((n) => n.id === p.noteId)).length;

/** After part `index` of a note is deleted: renumber exams that picked specific parts of it. */
export async function dropPartFromExams(uid: string, exams: Exam[], noteId: string, index: number): Promise<void> {
  await Promise.all(
    exams.map((exam) => {
      const pick = exam.notes.find((p) => p.noteId === noteId);
      if (!pick?.parts) return null; // whole note (or not on it): nothing to renumber
      const parts = pick.parts.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
      const notes = parts.length
        ? exam.notes.map((p) => (p.noteId === noteId ? { noteId, parts } : p))
        : exam.notes.filter((p) => p.noteId !== noteId);
      return examsStore.update(uid, exam.id, { notes });
    }),
  );
}
