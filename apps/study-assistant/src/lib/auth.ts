import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { MOCK } from './mock';
import type { AppUser } from './types';

const MOCK_USER: AppUser = { uid: 'mock-user', email: 'mock@example.com', name: 'Mock' };

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(MOCK ? MOCK_USER : null);
  const [loading, setLoading] = useState(!MOCK);

  useEffect(() => {
    if (MOCK) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, email: u.email, name: u.displayName } : null);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Some phone browsers block popups; a full-page redirect always works.
    if ((err as { code?: string }).code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
    } else {
      throw err;
    }
  }
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

/** Fresh Firebase ID token for the API's Authorization header. */
export async function idToken(): Promise<string> {
  if (MOCK) return 'mock';
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.getIdToken();
}
