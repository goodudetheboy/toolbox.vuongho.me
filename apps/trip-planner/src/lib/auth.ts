import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from './firebase';

const PENDING_EMAIL_KEY = 'trip-planner:pending-signin-email';

export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  return { user, loading };
}

export function signInWithGoogle(): Promise<unknown> {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

/** Sends a passwordless sign-in link to `email`; the link returns to the current page. */
export function sendEmailLink(email: string): Promise<void> {
  const result = sendSignInLinkToEmail(auth, email, {
    url: window.location.href,
    handleCodeInApp: true,
  });
  return result.then(() => {
    localStorage.setItem(PENDING_EMAIL_KEY, email);
  });
}

/** Call once on app load. Completes an email-link sign-in if the current URL is one, then cleans the URL. */
export async function completeEmailLinkSignInIfPresent(): Promise<void> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  let email = localStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) {
    email = window.prompt('Confirm your email to finish signing in:');
  }
  if (!email) return;

  await signInWithEmailLink(auth, email, window.location.href);
  localStorage.removeItem(PENDING_EMAIL_KEY);

  const url = new URL(window.location.href);
  url.searchParams.delete('apiKey');
  url.searchParams.delete('oobCode');
  url.searchParams.delete('mode');
  url.searchParams.delete('continueUrl');
  url.searchParams.delete('lang');
  window.history.replaceState({}, '', url.toString());
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}
