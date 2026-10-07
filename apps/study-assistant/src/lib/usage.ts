import { collection, collectionGroup, doc, getDocs, increment, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import type { AppUser, Attempt, Note } from './types';

// Usage stats for the admin page. Nothing here is collected just for stats except
// the profile: users/{uid} = { email, name, lastSeenAt, opens }, touched once per
// app load so the admin page can name users and say when they were last around.
// Everything else is read from what the app already stores (notes + attempts).

export interface Profile {
  email: string | null;
  name: string | null;
  lastSeenAt: number;
  opens: number;
}

export async function touchProfile(user: AppUser): Promise<void> {
  if (MOCK) return;
  await setDoc(
    doc(db, 'users', user.uid),
    { email: user.email, name: user.name, lastSeenAt: Date.now(), opens: increment(1) },
    { merge: true },
  );
}

export interface UsageNote {
  uid: string;
  id: string;
  title: string;
  subject: string;
  createdAt: number;
  chunks: { title: string; tries: number }[];
}

export interface UsageAttempt {
  uid: string;
  noteId: string;
  partId: string;
  at: number;
  percent: number;
  hints: number;
}

export interface UsageData {
  profiles: Record<string, Profile>;
  notes: UsageNote[];
  attempts: UsageAttempt[];
}

const toNote = (uid: string, id: string, n: Omit<Note, 'id'>): UsageNote => ({
  uid,
  id,
  title: n.title,
  subject: n.subject,
  createdAt: n.createdAt,
  chunks: n.chunks.map((c) => ({ title: c.title, tries: c.tries ?? 0 })),
});

const toAttempt = (uid: string, noteId: string, partId: string, a: Attempt): UsageAttempt => ({
  uid,
  noteId,
  partId,
  at: a.at,
  percent: a.percent,
  hints: a.hints,
});

/**
 * Every user's profile, notes and attempts (admin only — see firestore.rules). Whole
 * collections, no time filter: a collection-group range query would need its own index,
 * and two users' worth of attempts is small.
 */
export async function loadUsage(): Promise<UsageData> {
  if (MOCK) return mockUsage();
  const [users, notes, attempts] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collectionGroup(db, 'notes')),
    getDocs(collectionGroup(db, 'attempts')),
  ]);
  return {
    profiles: Object.fromEntries(users.docs.map((d) => [d.id, d.data() as Profile])),
    notes: notes.docs.map((d) => toNote(d.ref.parent.parent!.id, d.id, d.data() as Omit<Note, 'id'>)),
    // users/{uid}/notes/{noteId}/parts/{partId}/attempts/{id}
    attempts: attempts.docs.map((d) => {
      const [, uid, , noteId, , part] = d.ref.path.split('/');
      return toAttempt(uid, noteId, part, d.data() as Attempt);
    }),
  };
}

function mockUsage(): UsageData {
  const read = <T,>(key: string, fallback: T): T => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  };
  const uid = 'mock-user';
  const notes = read<Note[]>('study-assistant:mock-notes', []);
  const attempts = read<Record<string, Attempt[]>>('study-assistant:mock-attempts', {});
  return {
    profiles: { [uid]: { email: 'mock@example.com', name: 'Mock', lastSeenAt: Date.now(), opens: 1 } },
    notes: notes.map((n) => toNote(uid, n.id, n)),
    attempts: Object.entries(attempts).flatMap(([key, list]) => {
      const [noteId, part] = key.split('/');
      return list.map((a) => toAttempt(uid, noteId, part, a));
    }),
  };
}
