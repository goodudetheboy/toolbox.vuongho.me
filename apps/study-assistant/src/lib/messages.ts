import { addDoc, collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK } from './mock';
import type { AppUser } from './types';

// General feedback from the account menu ("Send feedback"), as opposed to the per-session
// ratings in feedback.ts. Saved at users/{uid}/messages/{id}; the admin page's Messages tab
// reads them all (collection-group read, admin-only in firestore.rules).

export const MESSAGE_KINDS = ['idea', 'problem', 'other'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface Message {
  kind: MessageKind;
  text: string;
  createdAt: number;
  email: string | null;
  name: string | null;
  /** Browser + device, to help reproduce a problem. */
  userAgent: string;
}

const MOCK_KEY = 'study-assistant:mock-messages';
const mockLoad = (): Message[] => {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) || '[]');
  } catch {
    return [];
  }
};

export async function sendMessage(user: AppUser, kind: MessageKind, text: string): Promise<void> {
  const message: Message = {
    kind,
    text: text.trim(),
    createdAt: Date.now(),
    email: user.email,
    name: user.name,
    userAgent: navigator.userAgent.slice(0, 300),
  };
  if (MOCK) {
    localStorage.setItem(MOCK_KEY, JSON.stringify([...mockLoad(), message]));
    return;
  }
  await addDoc(collection(db, 'users', user.uid, 'messages'), message);
}

/** Everyone's messages, newest first (admin only). Sorted here, so no collection-group index. */
export async function listAllMessages(): Promise<{ uid: string; message: Message }[]> {
  if (MOCK) return mockLoad().map((message) => ({ uid: 'mock-user', message })).reverse();
  const snap = await getDocs(collectionGroup(db, 'messages'));
  return snap.docs
    .map((d) => ({ uid: d.ref.parent.parent?.id ?? '?', message: d.data() as Message }))
    .sort((a, b) => b.message.createdAt - a.message.createdAt);
}
