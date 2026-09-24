import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Public web app config — safe to commit. Firebase web API keys aren't secret;
// access control is enforced by Firestore security rules, not by hiding this.
const firebaseConfig = {
  apiKey: 'AIzaSyA9__rgtKM2_bI73g9azCuIgyCOYExtAJo',
  authDomain: 'vuonghome.firebaseapp.com',
  projectId: 'vuonghome',
  storageBucket: 'vuonghome.firebasestorage.app',
  messagingSenderId: '727499475710',
  appId: '1:727499475710:web:0d629490f1d6b1e37b33af',
};

// Shared across future tools, not trip-planner-specific — see
// docs/adr/0001-trip-planner-local-first-plus-planned-shared-auth-and-sync.md
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Named database per the toolbox-wide per-tool Firestore convention
// (../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md).
export const db = getFirestore(app, 'toolbox-trip-planner');
