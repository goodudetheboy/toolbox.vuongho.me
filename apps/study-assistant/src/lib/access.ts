import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';

// Who may use the app: the built-in accounts (hard-coded in firestore.rules and ALLOWED_EMAILS
// in the deploy workflow — always allowed, so nobody can lock themselves out) plus the emails
// the admin adds on the admin page, stored in config/access { emails }. Both firestore.rules
// and the API read that document, so an added email works within a minute (API cache).

export const BUILT_IN_EMAILS = ['hochivuong2002@gmail.com', 'tling241004@gmail.com'];

const accessDoc = () => doc(db, 'config', 'access');
const MOCK_KEY = 'study-assistant:mock-access';
const mockListeners = new Set<() => void>();
const mockLoad = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '[]');
  } catch {
    return [];
  }
};
const mockSave = (emails: string[]) => {
  localStorage.setItem(MOCK_KEY, JSON.stringify(emails));
  mockListeners.forEach((l) => l());
};

/** Normalized email, or null if it doesn't look like one. */
export function cleanEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function subscribeAddedEmails(cb: (emails: string[]) => void, onError: (e: Error) => void): () => void {
  if (MOCK) {
    const emit = () => cb(mockLoad());
    mockListeners.add(emit);
    emit();
    return () => mockListeners.delete(emit);
  }
  return onSnapshot(accessDoc(), (snap) => cb((snap.get('emails') as string[] | undefined) ?? []), onError);
}

export async function addEmail(email: string, by: string | null): Promise<void> {
  if (MOCK) return mockSave([...new Set([...mockLoad(), email])]);
  await setDoc(accessDoc(), { emails: arrayUnion(email), updatedAt: Date.now(), updatedBy: by }, { merge: true });
}

export async function removeEmail(email: string, by: string | null): Promise<void> {
  if (MOCK) return mockSave(mockLoad().filter((e) => e !== email));
  await setDoc(accessDoc(), { emails: arrayRemove(email), updatedAt: Date.now(), updatedBy: by }, { merge: true });
}
