import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import type { AppUser } from './types';

// Has she seen the "How it works" cards? Kept on her profile (users/{uid}.guideSeen) so a
// new phone doesn't show them again, with a localStorage copy so it's known instantly.

const key = (uid: string) => `study-assistant:guide-seen:${uid}`;

function seenHere(uid: string): boolean {
  try {
    return localStorage.getItem(key(uid)) === '1';
  } catch {
    return false;
  }
}

function rememberHere(uid: string) {
  try {
    localStorage.setItem(key(uid), '1');
  } catch {
    // the profile copy still has it
  }
}

export async function loadGuideSeen(user: AppUser): Promise<boolean> {
  if (seenHere(user.uid)) return true;
  if (MOCK) return false;
  try {
    const seen = (await getDoc(doc(db, 'users', user.uid))).data()?.guideSeen === true;
    if (seen) rememberHere(user.uid);
    return seen;
  } catch {
    return true; // can't tell — better to skip the guide than to show it every launch
  }
}

export function markGuideSeen(user: AppUser) {
  rememberHere(user.uid);
  if (MOCK) return;
  setDoc(doc(db, 'users', user.uid), { guideSeen: true }, { merge: true }).catch(() => {});
}
