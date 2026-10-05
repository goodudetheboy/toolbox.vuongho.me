import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Public web app config — safe to commit (same shared config as trip-planner);
// access control is enforced by Firestore security rules and the API's allowlist.
const firebaseConfig = {
  apiKey: 'AIzaSyA9__rgtKM2_bI73g9azCuIgyCOYExtAJo',
  authDomain: 'vuonghome.firebaseapp.com',
  projectId: 'vuonghome',
  storageBucket: 'vuonghome.firebasestorage.app',
  messagingSenderId: '727499475710',
  appId: '1:727499475710:web:0d629490f1d6b1e37b33af',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Named database per the toolbox-wide per-tool Firestore convention
// (../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md).
//
// Persistent local cache (IndexedDB): notes open instantly from the device, and when
// the app reopens the listener resumes from a token, so the server only sends notes
// that changed since — not every note again. Matters on mobile data.
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  'toolbox-study-assistant',
);
