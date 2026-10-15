import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Public web app config (same shared `vuonghome` project as the other tools) —
// safe to commit; access control is enforced by firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyA9__rgtKM2_bI73g9azCuIgyCOYExtAJo',
  authDomain: 'vuonghome.firebaseapp.com',
  projectId: 'vuonghome',
  storageBucket: 'vuonghome.firebasestorage.app',
  messagingSenderId: '727499475710',
  appId: '1:727499475710:web:0d629490f1d6b1e37b33af',
};

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === '1';
const app = initializeApp(useEmulators ? { ...firebaseConfig, projectId: 'demo-churn' } : firebaseConfig);

export const auth = getAuth(app);

// Own named database, per the toolbox-wide convention
// (../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md).
export const db = getFirestore(app, 'toolbox-churn-machine');

// `VITE_FIREBASE_EMULATORS=1 npm run dev` talks to local emulators instead
// (firebase emulators:start --only firestore,auth); dev builds only.
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}
