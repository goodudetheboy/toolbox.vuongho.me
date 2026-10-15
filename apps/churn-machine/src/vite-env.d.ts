/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Dev only: "1" points Firebase at local Auth/Firestore emulators. */
  readonly VITE_FIREBASE_EMULATORS?: string;
}
