// Dev-only switch: `VITE_MOCK=1 npm run dev -w apps/study-assistant` swaps sign-in,
// Firestore and the API for in-memory fakes so the UI can be worked on without a
// Gemini key. Never true in a production build.
export const MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1';
